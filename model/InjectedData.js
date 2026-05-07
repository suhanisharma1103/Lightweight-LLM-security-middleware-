import mongoose from "mongoose";
const { Schema } = mongoose;

const injectedDataSchema = new Schema({
  ipAddress: { type: String, required: true },
  rawMessage: { type: String, required: true },
  cleanedMessage: { type: String, required: true },
  sanitizationLog: {
    truncated_in: { type: Boolean, required: true },
    removed_zero_width: { type: Number, required: true },
    unicode_nfkc: { type: Boolean, required: true },
    homoglyph_folds: { type: Number, required: true },
    decoded: { type: String, required: false },
    clamped_runs: { type: Boolean, required: true },
    truncated_out: { type: Boolean, required: true },
    sanitizedAndDeobfuscated: { type: Boolean, required: true },
  },
  thread_id: { type: String, required: false },
},
{
  timestamps: true,
}
);

const InjectedData = mongoose.model("InjectedData", injectedDataSchema);
export default InjectedData;
