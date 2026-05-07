import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY
});

(async () => {
  try {
    const models = await ai.models.list();
    console.log(models);
  } catch (err) {
    console.error(err);
  }
})();