// server.js (fixed version)
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

// IMPORTANT: Do NOT commit API keys to source control. Use env var in production.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.get("/api/debug-questions", (req, res) => {
  return res.json([
    { text: "Debug Q: Tell me about yourself.", category: "Behavioral", difficulty: "easy" },
    { text: "Debug Q: Explain a SQL join.", category: "Technical", difficulty: "medium" }
  ]);
});

app.post("/api/gemini", async (req, res) => {
  try {
    const { resume, position, company, difficulty } = req.body;

    if (!resume || !position) {
      return res.status(400).json({ error: "Missing required fields (resume or position)" });
    }

    const prompt = `
You are an interview question generator.
Read this resume and position and generate exactly 5 questions as JSON array only.
Each element must have:
{
  "text": "question text",
  "category": "topic name",
  "difficulty": "easy | medium | hard"
}

Resume:
${resume}

Position: ${position}
Company: ${company || "General"}
Preferred difficulty: ${difficulty || "easy"}

Return ONLY JSON. No explanations or text outside the JSON.
`;

    // 🌟 FIX APPLIED HERE: The API URL is now correctly assigned to the 'url' variable.
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    console.log("[server] calling Gemini endpoint:", url);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // this body shape is one commonly used for generateContent
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    const status = response.status;
    const raw = await response.text();

    console.log("[server] Gemini HTTP status:", status);
    console.log("[server] Gemini raw response (first 2000 chars):", raw.slice(0, 2000));

    // try parse as JSON
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error("[server] Failed to parse response JSON:", e);
      // return the raw text to the caller to help debug
      return res.status(502).json({
        error: "Failed to parse Gemini response JSON",
        httpStatus: status,
        rawResponseSnippet: raw.slice(0, 2000),
      });
    }

    // If API returned an error object (standard Google style), forward it
    if (data.error) {
      console.error("[server] Gemini returned error object:", data.error);
      return res.status(502).json({ error: "Gemini API error", details: data.error });
    }

    // Extract the text candidate if present
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!rawText) {
      console.warn("[server] No candidate text found in Gemini response. Full parsed body:", data);
    }

    // Try to extract JSON array from the returned text
    const jsonMatch = rawText?.match(/\[[\s\S]*\]/);
    let questions = [];

    if (jsonMatch) {
      try {
        questions = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error("[server] JSON.parse of matched text failed:", e);
      }
    }

    if (!questions.length) {
      // Return parsed server-side diagnostics so frontend can show more info
      const diagnostic = {
        message: "No valid questions produced by Gemini. Returning fallback.",
        httpStatus: status,
        rawText: rawText ? rawText.slice(0, 2000) : null,
        parsedBodySnippet: JSON.stringify(data).slice(0, 2000),
      };
      console.warn("[server] diagnostic:", diagnostic);

      return res.status(200).json([
        {
          text: "Failed to generate questions. Please try again.",
          category: "General",
          difficulty: "Preferred difficulty",
          _diagnostic: diagnostic,
        },
      ]);
    }

    // All good — return the questions array
    return res.json(questions);
  } catch (err) {
    console.error("[server] Exception while calling Gemini:", err);
    return res.status(500).json([
      {
        text: "Error generating questions.",
        category: "General",
        difficulty: "Preferred difficulty",
        _error: err.message || String(err),
      },
    ]);
  }
});

app.listen(5000, () => console.log("✅ Backend running on http://localhost:5000"));