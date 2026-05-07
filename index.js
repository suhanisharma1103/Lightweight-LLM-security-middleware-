import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import chatRoutes from "./routes/chatRoute.js";
import feedbackRoutes from "./routes/feedbackRoute.js";
import { sanitizeMiddleware } from "./middleware/sanitization.js";
import mongoose from "mongoose";
import connectDB from "./config/connectDB.js";
import { injecttionDetection } from "./middleware/injectionDetection.js";
import { responseGeneration } from "./middleware/responseGenerate.js";
import 'dotenv/config';

const PORT = process.env.PORT || 8080;
const app = express();

// ============= RATE LIMITER =============
// Max 10 requests per minute per IP
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10,
  message: {
    error: "Too many requests from this IP, please try again after a minute."
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Don't rate limit feedback endpoint (users rating predictions)
    return req.path.includes("/chat/feedback");
  }
});

// ============= MIDDLEWARE =============
connectDB();
app.use(cors());
app.use(express.json());

// ============= ROUTES =============

// ⭐ IMPORTANT: Feedback endpoint MUST come BEFORE the chat pipeline
// Otherwise it goes through sanitization middleware which expects a 'message' field
// Format: POST /chat/feedback/:thread_id
// Body: { gemini_was_correct: boolean, actual_label: "safe"|"flagged", reason?: string }
app.use("/chat/feedback", feedbackRoutes);

// Main chat pipeline with rate limiting
// Flow: sanitize → inject detection → response generation → chat controller
app.use("/chat", limiter, sanitizeMiddleware, injecttionDetection, responseGeneration, chatRoutes);

// ============= HEALTH CHECK ENDPOINT =============
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============= METRICS ENDPOINT (Optional - for diagnostics) =============
app.get("/api/stats", async (req, res) => {
  try {
    const Chat = mongoose.model("Chat");
    
    const total = await Chat.countDocuments();
    const withFeedback = await Chat.countDocuments({ "user_feedback": { $exists: true, $ne: null } });
    const flagged = await Chat.countDocuments({ "gemini_prediction": "flagged" });
    
    res.json({
      total_predictions: total,
      with_feedback: withFeedback,
      feedback_rate: ((withFeedback / total) * 100).toFixed(2) + "%",
      flagged_count: flagged,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error("Stats endpoint error:", err);
    res.status(500).json({ error: "Failed to retrieve stats" });
  }
});

// ============= DATABASE CONNECTION =============
mongoose.connection.once('open', () => {
  console.log('✅ Connected to MongoDB');
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Metrics endpoint: GET http://localhost:${PORT}/api/stats`);
    console.log(`❤️  Health check: GET http://localhost:${PORT}/health`);
    console.log(`📝 Feedback endpoint: POST http://localhost:${PORT}/chat/feedback/:thread_id`);
  });
});

// ============= ERROR HANDLING =============
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled rejection:', err);
});

export default app;