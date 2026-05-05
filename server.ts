import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenerativeAI } from "@google/generative-ai";
import admin from "firebase-admin";
import "dotenv/config";

import { getFirestore, FieldValue } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
import fs from "fs";
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
const fbConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

if (!admin.apps.length) {
  try {
    // try default first for cloud run environment
    admin.initializeApp();
    console.log("Firebase Admin initialized with default credentials.");
  } catch (e) {
    console.warn("Default Admin init failed, trying with explicit projectId:", fbConfig.projectId);
    try {
      admin.initializeApp({
        projectId: fbConfig.projectId,
      });
      console.log("Firebase Admin initialized with Project ID:", fbConfig.projectId);
    } catch (innerError: any) {
      console.error("Firebase Admin initialization failed completely:", innerError.message);
    }
  }
}

// Get Firestore instance with specific databaseId
const db = fbConfig.firestoreDatabaseId && fbConfig.firestoreDatabaseId !== "(default)"
  ? getFirestore(fbConfig.firestoreDatabaseId)
  : getFirestore();

// Test Firestore Connectivity on startup (Skipped for custom client-side projects)
// async function checkFirestore() { ... }

// GEMINI API KEY initialization
const apiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenerativeAI(apiKey);

if (!apiKey) {
  console.warn("CRITICAL: GEMINI_API_KEY is not set. AI features will fail.");
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  console.log("Server instance starting...");
  console.log("Firebase Database ID:", fbConfig.firestoreDatabaseId || "(default)");
  console.log("Gemini API Key status:", apiKey ? "PRESENT" : "MISSING");
  if (apiKey) {
    console.log("Key Prefix:", apiKey.substring(0, 4) + "****");
  }

  const PORT = 3000;

  // Background Analysis Endpoint
  app.post("/api/analyze", async (req, res) => {
    const { fileData, mimeType, userId, sessionId } = req.body;

    if (!fileData || !userId || !sessionId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Process and return result
    try {
      const model = ai.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1, // Lower temperature for faster, more deterministic extraction
        }
      });
      const prompt = `Extract academic data from this document. Output ONLY raw JSON matching this schema:
      {
        "subject": string,
        "year": string,
        "totalQuestions": number,
        "summary": "1-2 sentence summary",
        "topics": [{ "name": string, "questions": [{ "text": string, "difficulty": string }] }]
      }
      
      Speed is critical. Ensure JSON is valid and structure is exact.`;

      const result = await model.generateContent([
        { inlineData: { data: fileData, mimeType } },
        { text: prompt }
      ]);

      const response = await result.response;
      const resultText = response.text() || "{}";
      const analysisData = JSON.parse(resultText);

      // Return data directly to client (client will save it)
      res.json({ 
        status: "completed", 
        data: {
          ...analysisData,
          topicsJson: JSON.stringify(analysisData.topics),
          userId,
          createdAt: new Date().toISOString()
        }
      });

    } catch (error: any) {
      console.error("Analysis error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Background processing failed",
        details: error?.response?.data || error?.message
      });
    }
  });

  // Generate Notes Endpoint (Streaming version)
  app.post("/api/generate-notes", async (req, res) => {
    const { topic, subject } = req.body;
    if (!topic || !subject) return res.status(400).json({ error: "Missing topic or subject" });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `Create detailed, easy-to-understand bilingual notes (Hindi and English) for the topic "${topic}" in the subject "${subject}". 
      Use the latest updated content. Use a student-friendly tone. 
      Structure it with headings, bullet points, and key takeaways.
      Format the output in clear Markdown.`;

      const result = await model.generateContentStream([{ text: prompt }]);
      
      for await (const chunk of result.stream) {
        const text = chunk.text();
        res.write(text);
      }
      res.end();
    } catch (error) {
      console.error("Notes generation error:", error);
      res.status(500).end();
    }
  });

  // Generate Practice Paper Endpoint
  app.post("/api/generate-practice", async (req, res) => {
    const { analysis } = req.body;
    if (!analysis) return res.status(400).json({ error: "Missing analysis data" });

    try {
      const model = ai.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
      });

      const prompt = `Based on the following analysis of a previous year paper, create a NEW practice question paper.
      Subject: ${analysis.subject}
      Distribution of topics: ${analysis.topics.map((t: any) => `${t.name}: ${t.questions.length} questions`).join(', ')}
      
      Guidelines:
      1. Follow the same pattern and difficulty levels.
      2. All questions must be NEW but cover the same core concepts.
      3. Change the question values or scenarios.
      4. Return a structured JSON list of questions { "questions": [ { "text": "...", "topic": "...", "difficulty": "..." } ] }.`;

      const result = await model.generateContent([{ text: prompt }]);
      const response = await result.response;
      const text = response.text() || "{}";
      res.json(JSON.parse(text.trim()));
    } catch (error) {
      console.error("Practice paper generation error:", error);
      res.status(500).json({ error: "Failed to generate practice paper" });
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // For Express v5, use *all to catch all routes for SPA
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer();
