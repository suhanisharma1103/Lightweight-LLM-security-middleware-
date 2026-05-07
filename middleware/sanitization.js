import { Buffer } from "buffer";
import Obsfucated from "../model/Obsfucated.js";
import console from "console";

const MAX_CHARS_IN = 50000;
const MAX_CHARS_OUT = 10000;
const MAX_DECODE_BYTES = 64000;
const MAX_REPEAT_RUN = 50;
const MIN_DECODE_LEN = 32;
const PRINTABLE_RATIO_CUTOFF = 0.85;

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
const BASE64_LIKE_RE = /^[A-Za-z0-9+/=\s]{32,}$/;
const HEX_LIKE_RE = /^[0-9A-Fa-f\s]{32,}$/;

const BASE64_ALLOWED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const HEX_ALLOWED = "0123456789abcdefABCDEF";

const HOMOGLYPH_MAP = {
    "ɑ": "a", "ȧ": "a", "ӑ": "a",
    "ʀ": "r", "ŕ": "r",
    "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K",
    "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
    "α": "a", "β": "b", "γ": "y", "δ": "d", "ε": "e", "ι": "i", "κ": "k",
    "ο": "o", "ρ": "p", "τ": "t", "υ": "y", "χ": "x",
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O",
    "Р": "P", "С": "C", "Т": "T", "У": "Y", "Х": "X",
    "а": "a", "в": "b", "е": "e", "к": "k", "м": "m", "н": "h", "о": "o",
    "р": "p", "с": "c", "т": "t", "у": "y", "х": "x",
    "ℌ": "H", "ⅰ": "i", "ⅱ": "ii", "ⅲ": "iii",
};

/**
 * NEW: Un-escapes Unicode sequences like '\\u200b' into the actual character.
 * This handles inputs where escape sequences are passed as literal strings.
 * @param {string} str The string to un-escape.
 * @returns {string} The un-escaped string.
 */

function unescapeUnicode(str) {
    return str.replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) => {
        return String.fromCharCode(parseInt(grp, 16));
    });
}

function foldHomoglyphs(text) {
    return [...text].map(ch => HOMOGLYPH_MAP[ch] || ch).join('');
}

function mostlyPrintableASCII(s) {
    if (!s) return false;
    const printable = (s.match(/[\x09\x0A\x0D\x20-\x7E]/g) || []).length;
    return (printable / s.length) >= PRINTABLE_RATIO_CUTOFF;
}

function _charsetRatio(s, allowed) {
    const allowedSet = new Set(allowed);
    const match = [...s].filter(ch => allowedSet.has(ch) || /\s/.test(ch)).length;
    return match / Math.max(1, s.length);
}

function clampRepeats(s, maxRun) {
    let result = '';
    let last = null;
    let run = 0;
    for (const ch of s) {
        if (ch === last) {
            run++;
            if (run <= maxRun) {
                result += ch;
            }
        } else {
            last = ch;
            run = 1;
            result += ch;
        }
    }
    return result;
}

function tryDecodeBase64(s) {
    const compact = s.replace(/\s/g, '');
    if (compact.length < MIN_DECODE_LEN) return [false, s];
    if (!BASE64_LIKE_RE.test(s)) return [false, s];
    if (_charsetRatio(s, BASE64_ALLOWED) < 0.95) return [false, s];
    try {
        const raw = Buffer.from(compact, 'base64');
        if (raw.length === 0 || raw.length > MAX_DECODE_BYTES) return [false, s];
        const decoded = raw.toString('utf-8');
        if (mostlyPrintableASCII(decoded)) return [true, decoded];
    } catch (_) {}
    return [false, s];
}

function tryDecodeHex(s) {
    const compact = s.replace(/\s/g, '');
    if (compact.length < MIN_DECODE_LEN || compact.length % 2 !== 0) return [false, s];
    if (!HEX_LIKE_RE.test(s)) return [false, s];
    if (_charsetRatio(s, HEX_ALLOWED) < 0.95) return [false, s];
    try {
        const raw = Buffer.from(compact, 'hex');
        if (raw.length === 0 || raw.length > MAX_DECODE_BYTES) return [false, s];
        const decoded = raw.toString('utf-8');
        if (mostlyPrintableASCII(decoded)) return [true, decoded];
    } catch (_) {}
    return [false, s];
}

export function sanitizeAndDeobfuscate(raw) {
    const log = {
        truncated_in: false,
        removed_zero_width: 0,
        unicode_nfkc: false,
        homoglyph_folds: 0,
        decoded: null,
        clamped_runs: false,
        truncated_out: false,
        sanitizedAndDeobfuscated: false
    };

    // --- FIX: ADDED PREPROCESSING STEP ---
    // First, un-escape any literal unicode sequences like '\\u200b'
    let text = unescapeUnicode(raw);
    if (text !== raw) {
        // This indicates something was changed, good to flag for sanitization
        log.sanitizedAndDeobfuscated = true;
    }
    // --- END FIX ---

    if (text.length > MAX_CHARS_IN) {
        text = text.slice(0, MAX_CHARS_IN);
        log.truncated_in = true;
        log.sanitizedAndDeobfuscated = true;
    }

    const originalText = text;
    text = text.normalize('NFKC');
    if (originalText !== text) {
        log.unicode_nfkc = true;
        log.sanitizedAndDeobfuscated = true;
    }

    const zeroMatches = text.match(ZERO_WIDTH_RE) || [];
    if (zeroMatches.length > 0) {
        log.removed_zero_width = zeroMatches.length;
        text = text.replace(ZERO_WIDTH_RE, '');
        log.sanitizedAndDeobfuscated = true;
    }

    const beforeFold = text;
    text = foldHomoglyphs(text);
    if (beforeFold !== text) {
        log.homoglyph_folds = [...beforeFold].reduce((acc, ch, i) => {
            return (i < text.length && ch !== text[i]) ? acc + 1 : acc;
        }, 0);
        log.sanitizedAndDeobfuscated = true;
    }

    let decoded = false;
    const blobLike = text.length >= MIN_DECODE_LEN && (BASE64_LIKE_RE.test(text) || HEX_LIKE_RE.test(text));
    if (blobLike) {
        let ok, t2;
        [ok, t2] = tryDecodeBase64(text);
        if (ok) {
            text = t2;
            decoded = true;
            log.decoded = 'base64';
        } else {
            [ok, t2] = tryDecodeHex(text);
            if (ok) {
                text = t2;
                decoded = true;
                log.decoded = 'hex';
            }
        }

        if (decoded) {
            log.sanitizedAndDeobfuscated = true;
            text = text.normalize("NFKC");
            text = text.replace(ZERO_WIDTH_RE, '');
            text = foldHomoglyphs(text);
        }
    }

    const clamped = clampRepeats(text, MAX_REPEAT_RUN);
    if (clamped !== text) {
        text = clamped;
        log.clamped_runs = true;
        log.sanitizedAndDeobfuscated = true;
    }

    if (text.length > MAX_CHARS_OUT) {
        text = text.slice(0, MAX_CHARS_OUT);
        log.truncated_out = true;
        log.sanitizedAndDeobfuscated = true;
    }

    return { cleaned: text, log };
}

export async function sanitizeMiddleware(req, res, next) {
    try {
        const message = req.body?.message;

        if (typeof message !== 'string') {
            return res.status(400).json({
                error: "Invalid request: 'message' must be a string in the request body."
            });
        }


        req.body.clientIp = req.ip || req.headers["x-forwarded-for"] || "unknown";
        const result = sanitizeAndDeobfuscate(message);
        req.body.cleanedText = result.cleaned;
        req.body.sanitizationLog = result.log;

        if (result.log.sanitizedAndDeobfuscated) {
            await Obsfucated.create({
                ipAddress: req.body.clientIp,
                rawMessage: message,
                cleanedMessage: result.cleaned,
                sanitizationLog: result.log,
                thread_id: req.body?.thread_id ?? null,
            });
        }

        next();
    } catch (error) {
        console.error('Sanitization error:', error);
        return res.status(500).json({
            error: 'Internal Server Error during sanitization.'
        });
    }
}

