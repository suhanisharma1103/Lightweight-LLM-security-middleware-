import express from "express";
import Chat from "../model/Chat.js";

const router = express.Router();

/**
 * POST /chat/feedback/:thread_id
 * Collect user feedback on whether Gemini's classification was correct
 * 
 * Body: {
 *   gemini_was_correct: true/false,
 *   actual_label: "safe" or "flagged",
 *   reason: "optional explanation"
 * }
 */
router.post("/:thread_id", async (req, res) => {
  try {
    const { thread_id } = req.params;
    const { gemini_was_correct, actual_label, reason } = req.body;

    // 🔍 DEBUG: Check incoming request
    console.log("🔍 Feedback received for thread_id:", thread_id);
    console.log("📦 Request body:", req.body);

    // 🔍 DEBUG: Check if document exists
    const existing = await Chat.findOne({ thread_id });
    console.log("📄 Found document:", existing);

    // ✅ Validation
    if (typeof gemini_was_correct !== "boolean") {
      return res.status(400).json({ error: "gemini_was_correct must be true or false" });
    }

    if (!["safe", "flagged"].includes(actual_label)) {
      return res.status(400).json({ error: "actual_label must be 'safe' or 'flagged'" });
    }

    // ✅ Update feedback
    const updatedChat = await Chat.findOneAndUpdate(
      { thread_id },
      {
        $set: {
          user_feedback: {
            gemini_was_correct,
            actual_label,
            reason: reason || "",
            feedback_timestamp: new Date(),
          },
        },
      },
      { new: true }
    );

    // ❌ If no document found → IMPORTANT DEBUG
    if (!updatedChat) {
      console.log("❌ No document found for thread_id:", thread_id);
      return res.status(404).json({ error: "Chat record not found" });
    }

    // ✅ Success log
    console.log("✅ Feedback saved:", updatedChat.user_feedback);

    return res.json({
      status: "feedback recorded",
      thread_id,
      feedback: updatedChat.user_feedback,
    });

  } catch (err) {
    console.error("❌ Feedback Error:", err);
    return res.status(500).json({ error: "Internal Server Error recording feedback" });
  }
});

export default router;