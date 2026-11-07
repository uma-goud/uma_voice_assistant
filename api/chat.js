import fs from "fs";
import path from "path";

const read = (file) =>
  fs.readFileSync(path.join(process.cwd(), "backend", file), "utf8");

const SYSTEM =
  read("system_prompt.md") + "\n\nKNOWLEDGE BASE:\n" + read("knowledge_base.md");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { messages = [] } = req.body;
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: messages.slice(-10).map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.text }],
          })),
          generationConfig: {
            maxOutputTokens: 350,
            temperature: 0.8,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );
    const d = await r.json();
    const text =
      d.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
      "Sorry, could you ask that once more?";
    res.status(200).json({ text });
  } catch (e) {
    res.status(200).json({ text: "Sorry, something went wrong. Please try again." });
  }
}