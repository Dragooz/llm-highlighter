require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SHARED_SECRET = process.env.SHARED_SECRET || "";

if (!OPENROUTER_API_KEY) {
    console.error("ERROR: OPENROUTER_API_KEY not set in .env");
    process.exit(1);
}

app.use(
    cors({
        origin: "*", // Restrict to your deployment domain in production
    }),
);
app.use(express.json());

// Optional shared secret auth
function checkSecret(req, res, next) {
    if (!SHARED_SECRET) return next(); // No secret configured → skip check
    const provided = req.headers["x-secret"];
    if (provided !== SHARED_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

app.post("/generate", checkSecret, async (req, res) => {
    const { text, systemPrompt, model } = req.body;

    if (!text || typeof text !== "string") {
        return res
            .status(400)
            .json({ error: 'Missing or invalid "text" field' });
    }

    const selectedModel = model || "minimax/minimax-m2.7";
    const sysPrompt =
        systemPrompt ||
        "You are a helpful customer service representative. Reply professionally and concisely.";

    try {
        const response = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
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
                        { role: "system", content: sysPrompt },
                        { role: "user", content: text },
                    ],
                    max_tokens: 512,
                    temperature: 0.7,
                }),
            },
        );

        if (!response.ok) {
            const errText = await response.text();
            console.error(`OpenRouter error ${response.status}:`, errText);
            return res
                .status(502)
                .json({ error: `OpenRouter error: ${response.status}` });
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content;

        if (!reply) {
            return res.status(502).json({ error: "Empty response from model" });
        }

        res.json({ response: reply.trim() });
    } catch (err) {
        console.error("Fetch error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

app.listen(PORT, () => {
    console.log(`LLM Highlighter backend running on http://localhost:${PORT}`);
    console.log(
        `Model: configurable per request (default: minimax/minimax-m2.7)`,
    );
});
