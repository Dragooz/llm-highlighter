require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Redis } = require("@upstash/redis");

const app = express();
const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SHARED_SECRET = process.env.SHARED_SECRET || "";

if (!OPENROUTER_API_KEY) {
    console.error("ERROR: OPENROUTER_API_KEY not set in .env");
    process.exit(1);
}

if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
) {
    console.error(
        "ERROR: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set",
    );
    process.exit(1);
}

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const PROMPTS_DIR = path.join(__dirname, "prompts");
const TONE_KEY = "tone";
const KB_KEY = "knowledge_base";
const FAQ_KEY = "faq_entries";

// Seed Redis from files if keys don't exist yet (one-time migration)
async function seedIfMissing(key, filePath) {
    const exists = await redis.exists(key);
    if (!exists) {
        const content = fs.readFileSync(filePath, "utf8").trim();
        await redis.set(key, content);
        console.log(`Seeded Redis key "${key}" from ${filePath}`);
    }
}

async function init() {
    await seedIfMissing(TONE_KEY, path.join(PROMPTS_DIR, "tone.txt"));
    await seedIfMissing(KB_KEY, path.join(PROMPTS_DIR, "knowledge_base.txt"));
    console.log("Redis ready.");
}

async function buildSystemPrompt() {
    const [tone, knowledgeBase, faqEntries] = await Promise.all([
        redis.get(TONE_KEY),
        redis.get(KB_KEY),
        redis.lrange(FAQ_KEY, 0, -1),
    ]);

    const faqSection =
        faqEntries && faqEntries.length
            ? `\n\n---\n\n# FAQ (curated Q&A from support team)\n\n${faqEntries.join("\n\n")}`
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
        return res
            .status(400)
            .json({ error: 'Missing or invalid "text" field' });
    }

    const selectedModel = model || "minimax/minimax-m2.7";
    const systemPrompt = await buildSystemPrompt();

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
                        { role: "system", content: systemPrompt },
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
        if (!reply)
            return res.status(502).json({ error: "Empty response from model" });

        res.json({ response: reply.trim() });
    } catch (err) {
        console.error("Fetch error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post("/faq", checkSecret, async (req, res) => {
    const { question, answer } = req.body;

    if (!question || !answer) {
        return res
            .status(400)
            .json({ error: "question and answer are required" });
    }

    const entry = `Q: ${question.trim()}\nA: ${answer.trim()}`;
    await redis.rpush(FAQ_KEY, entry);
    console.log("FAQ entry added:", question.trim().slice(0, 80));
    res.json({ ok: true });
});

app.get("/faq", checkSecret, async (_req, res) => {
    const entries = await redis.lrange(FAQ_KEY, 0, -1);
    res.json({ entries: entries || [] });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

init()
    .then(() => {
        app.listen(PORT, () => {
            console.log(
                `LLM Highlighter backend running on http://localhost:${PORT}`,
            );
        });
    })
    .catch((err) => {
        console.error("Init failed:", err);
        process.exit(1);
    });
