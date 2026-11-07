import fs from "fs";
import path from "path";

const read = (file) =>
  fs.readFileSync(path.join(process.cwd(), "backend", file), "utf8");

const SYSTEM =
  read("prompts/system_prompt.md") +
  "\n\nKNOWLEDGE BASE:\n" +
  read("knowledge/knowledge_base.md");

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ text: "Method not allowed." });
  }

  try {
    const { messages = [] } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ text: "Please enter a question." });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is missing.");
      return res.status(500).json({
        text: "The assistant is not configured correctly. Please try again later.",
      });
    }

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM }],
        },

        contents: messages.slice(-6).map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.text }],
        })),

        generationConfig: {
          maxOutputTokens: 350,
          temperature: 0.7,
          thinkingConfig: {
            thinkingLevel: "minimal",
          },
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", response.status, JSON.stringify(data));
      return res.status(502).json({
        text: "I'm having trouble generating a response. Please try again.",
      });
    }

    const answer = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!answer) {
      console.error("Gemini returned no answer:", JSON.stringify(data));
      return res.status(502).json({
        text: "I couldn't generate an answer just now. Could you ask again?",
      });
    }

    console.log("Gemini response received successfully.");

    return res.status(200).json({ text: answer });
  } catch (error) {
    console.error("Chat API error:", error);
    return res.status(500).json({
      text: "Sorry, something went wrong. Please try again.",
    });
  }
}