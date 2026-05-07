import { v4 as uuidv4 } from "uuid";
import { Ollama } from "@langchain/ollama";
import {
  START,
  END,
  StateGraph,
  MemorySaver,
  MessagesAnnotation,
} from "@langchain/langgraph";

const llm = new Ollama({
  model: "tinyllama",
  baseUrl: "http://localhost:11434",
});

const callModel = async (state) => {
  const response = await llm.invoke(state.messages);
  return { messages: [response] };
};

const graph = new StateGraph(MessagesAnnotation)
  .addNode("model", callModel)
  .addEdge(START, "model")
  .addEdge("model", END);

const memory = new MemorySaver();
const app = graph.compile({ checkpointer: memory });
export async function responseGeneration(req, res, next) {
  try {
    const { message, cleanedText, thread_id } = req.body;

    const inputText = typeof cleanedText === "string" ? cleanedText : message;
    if (!inputText || typeof inputText !== "string") {
      return res.status(400).json({ error: "Missing or invalid message." });
    }

    // ✅ Persist thread_id
    let finalThreadId = thread_id;
    if (!finalThreadId) {
      finalThreadId = uuidv4();
    }

    const config = {
      configurable: { thread_id: finalThreadId },
    };

    // ✅ Add system prompt
    const input = {
      messages: [
        {
          role: "system",
          content:
            "You are a helpful AI assistant. Answer clearly and directly. Do not prefix responses with 'AI' or 'Assistant'.",
        },
        { role: "user", content: inputText },
      ],
    };

    const output = await app.invoke(input, config);
    const last = output.messages[output.messages.length - 1];

    // ✅ Safe response handling
    const cleanResponse = (text) => {
      return text
        .replace(/^AI Assistant:\s*/i, "")
        .replace(/^AI:\s*/i, "")
        .trim();
    };

    const rawText = last?.content || "Sorry, I couldn't generate a response.";
    req.body.generatedResponse = cleanResponse(rawText);

    // ✅ Pass SAME thread_id
    req.body.thread_id = finalThreadId;

    // ✅ Proper chat history
    req.body.chatHistory = output.messages.map((msg) => ({
      role: msg.role,
      content: msg.content || "",
    }));

    console.log("🧵 Thread ID:", finalThreadId);

    next();
  } catch (err) {
    console.error("Response Generation Error:", err);
    res.status(500).json({ error: "Internal Server Error during response generation." });
  }
}