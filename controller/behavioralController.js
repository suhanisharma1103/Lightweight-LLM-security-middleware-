import { GoogleGenAI } from "@google/genai";
import Chat from "../model/Chat.js";
import 'dotenv/config';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export default async function behavioralController(req, res) {
  try {
    const { generatedResponse, thread_id, chatHistory, cleanedText, sanitizationLog } = req.body;

    if (!generatedResponse || typeof generatedResponse !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'generatedResponse'." });
    }
    if (!thread_id || typeof thread_id !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'thread_id'." });
    }

    // ---- Behavioral Classification ----
    const classificationResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ text: generatedResponse, role: "user" }],
      config: {
        systemInstruction: `You are a content safety and policy enforcement model.
Your task is to strictly classify a given message as either safe or flagged, depending on whether it violates core safety and ethical guidelines.

Classification Goal:
Decide if the text contains any unsafe or policy-violating material.
When uncertain, err on the side of caution and flag it.
Flag the message if it includes any of the following:
Hate speech or harassment, Violence or threats, Sexual or explicit content, Self-harm or suicide,
Illegal or unethical acts, Misinformation, Sensitive data exposure, Harmful manipulation.
If none of the above apply, classify as safe.

Output Format:
Return only one JSON object:
{
  "label": "safe" | "flagged",
  "category": "string | null",
  "confidence": 0.0,
  "reason": "short explanation (1-2 sentences)",
  "excerpt": "exact risky text if flagged"
}

Rules:
Do not include text outside the JSON.
Do not use "needs review" or "unsure" — only "safe" or "flagged".`,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            label: { type: "string" },
            category: { type: ["string", "null"] },
            confidence: { type: "number" },
            reason: { type: "string" },
            excerpt: { type: "string" },
          },
          required: ["label", "category", "confidence", "reason", "excerpt"],
        },
      },
    });

    const classification = JSON.parse(classificationResult.candidates[0].content.parts[0].text) || null;

    if (!classification || !classification.label) {
      return res.status(500).json({ error: "Invalid classification response from AI." });
    }

    // ---- Save to Database with Metrics Logging ----
    const chatRecord = await Chat.findOneAndUpdate(
      { thread_id },
      {
        $set: {
          ipAddress: req.body.clientIp,
          rawMessage: generatedResponse,
          cleanedMessage: cleanedText,
          sanitizationLog: sanitizationLog,
          generatedResponse,
          classification,
          chatHistory: chatHistory || [],
          // === METRICS FIELDS (for ML tracking) ===
          gemini_prediction: classification.label,
          gemini_confidence: classification.confidence,
          gemini_category: classification.category,
          prediction_timestamp: new Date(),
          model_version: "v1.0-gemini-2.5-flash",
          user_feedback: null, // Will be filled later when user provides feedback
          feedback_timestamp: null,
        },
      },
      { upsert: true, new: true }
    );

    if (classification.label === "flagged") {
      return res.status(200).json({
        response: "Sorry, I cannot process that request.",
        classification,
        thread_id,
        gemini_flagged: true,
      });
    }

    // If safe, return the response
    return res.json({
      response: generatedResponse,
      thread_id,
      gemini_flagged: false,
    });
  } catch (err) {
    console.error("Behavioral Controller Error:", err);
    return res.status(500).json({ error: "Internal Server Error during behavioral check." });
  }
}