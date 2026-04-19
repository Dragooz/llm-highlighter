require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SHARED_SECRET = process.env.SHARED_SECRET || "";

const PROMPTS_DIR = path.join(__dirname, "prompts");
const FAQ_PATH    = path.join(PROMPTS_DIR, "faq.txt");

if (!OPENROUTER_API_KEY) {
    console.error("ERROR: OPENROUTER_API_KEY not set in .env");
    process.exit(1);
}

// Ensure faq.txt exists
if (!fs.existsSync(FAQ_PATH)) fs.writeFileSync(FAQ_PATH, "");

function buildSystemPrompt() {
    const tone          = fs.readFileSync(path.join(PROMPTS_DIR, "tone.txt"), "utf8").trim();
    const knowledgeBase = fs.readFileSync(path.join(PROMPTS_DIR, "knowledge_base.txt"), "utf8").trim();
    const faq           = fs.readFileSync(FAQ_PATH, "utf8").trim();

    const faqSection = faq
        ? `\n\n---\n\n# FAQ (curated Q&A from support team)\n\n${faq}`
        : "";

    return `${tone}\n\n---\n\n# Knowledge Base\n\n${knowledgeBase}${faqSection}`;
}

app.use(cors({ origin: "*" }));
app.use(express.json());

function checkSecret(req, res, next) {
    if (!SHARED_SECRET) return next();
    if (req.headers["x-secret"] !== SHARED_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

app.post("/generate", checkSecret, async (req, res) => {
    const { text, model } = req.body;

    if (!text || typeof text !== "string") {
        return res.status(400).json({ error: 'Missing or invalid "text" field' });
    }

    const selectedModel  = model || "minimax/minimax-m2.7";
    const systemPrompt   = buildSystemPrompt();   // re-read on every request → faq changes take effect immediately

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://llm-highlighter.local",
                "X-Title": "LLM Highlighter",
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user",   content: text },
                ],
                max_tokens: 512,
                temperature: 0.7,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`OpenRouter error ${response.status}:`, errText);
            return res.status(502).json({ error: `OpenRouter error: ${response.status}` });
        }

        const data  = await response.json();
        const reply = data.choices?.[0]?.message?.content;
        if (!reply) return res.status(502).json({ error: "Empty response from model" });

        res.json({ response: reply.trim() });
    } catch (err) {
        console.error("Fetch error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Append a new Q&A entry to faq.txt
app.post("/faq", checkSecret, (req, res) => {
    const { question, answer } = req.body;

    if (!question || !answer) {
        return res.status(400).json({ error: "question and answer are required" });
    }

    const entry = `\nQ: ${question.trim()}\nA: ${answer.trim()}\n`;
    fs.appendFileSync(FAQ_PATH, entry, "utf8");
    console.log("FAQ entry added:", question.trim().slice(0, 80));
    res.json({ ok: true });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
    console.log(`LLM Highlighter backend running on http://localhost:${PORT}`);
});
