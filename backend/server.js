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
const DIGEST_KEY = "knowledge_digest";

async function seedIfMissing(key, filePath) {
    const exists = await redis.exists(key);
    if (!exists) {
        const content = fs.readFileSync(filePath, "utf8").trim();
        await redis.set(key, content);
        console.log(`Seeded Redis key "${key}" from ${filePath}`);
    }
}

async function seedAlways(key, filePath) {
    const content = fs.readFileSync(filePath, "utf8").trim();
    await redis.set(key, content);
    console.log(`Synced Redis key "${key}" from ${filePath}`);
}

async function init() {
    // Tone always syncs from file on deploy — so pushing to main updates it
    await seedAlways(TONE_KEY, path.join(PROMPTS_DIR, "tone.txt"));
    // Knowledge base also always syncs
    await seedAlways(KB_KEY, path.join(PROMPTS_DIR, "knowledge_base.txt"));
    console.log("Redis ready.");
}

async function buildSystemPrompt() {
    const [tone, knowledgeBase, faqEntries, digestLog] = await Promise.all([
        redis.get(TONE_KEY),
        redis.get(KB_KEY),
        redis.lrange(FAQ_KEY, 0, -1),
        redis.get(DIGEST_KEY),
    ]);

    const faqSection =
        faqEntries && faqEntries.length
            ? `\n\n---\n\n# FAQ (curated Q&A from support team)\n\n${faqEntries.join("\n\n")}`
            : "";

    const digestSection =
        digestLog
            ? `\n\n---\n\n# Accumulated Knowledge (from conversation digests)\n\n${digestLog}`
            : "";

    return `${tone}\n\n---\n\n# Knowledge Base\n\n${knowledgeBase}${faqSection}${digestSection}`;
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
    const { text, messages: userMessages, model } = req.body;

    // Support both old {text} and new {messages} format
    let chatMessages;
    if (userMessages && Array.isArray(userMessages)) {
        chatMessages = userMessages.filter(m => m.role && m.content);
    } else if (text && typeof text === "string") {
        chatMessages = [{ role: "user", content: text }];
    } else {
        return res.status(400).json({ error: 'Missing "messages" array or "text" field' });
    }

    const selectedModel = model || "deepseek/deepseek-v3.2";
    const systemPrompt = await buildSystemPrompt();

    try {
        const upstream = await fetch(
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
                    stream: true,
                    messages: [
                        { role: "system", content: systemPrompt },
                        ...chatMessages,
                    ],
                    max_tokens: 512,
                    temperature: 0.7,
                }),
            },
        );

        if (!upstream.ok) {
            const errText = await upstream.text();
            console.error(`OpenRouter error ${upstream.status}:`, errText);
            return res.status(502).json({ error: `OpenRouter error: ${upstream.status}` });
        }

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop(); // keep incomplete line

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data:")) continue;
                const data = trimmed.slice(5).trim();
                if (data === "[DONE]") {
                    res.write("data: [DONE]\n\n");
                    continue;
                }
                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) {
                        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
                    }
                } catch (_) { /* skip malformed */ }
            }
        }

        res.end();
    } catch (err) {
        console.error("Fetch error:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        } else {
            res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            res.end();
        }
    }
});

app.post("/faq", checkSecret, async (req, res) => {
    const { question, answer } = req.body;

    if (!question || !answer) {
        return res.status(400).json({ error: "question and answer are required" });
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

// ── Conversation logging ─────────────────────────────────────────────────────

app.post("/conversations", checkSecret, async (req, res) => {
    const { userId, messages } = req.body;

    if (!userId || !messages || !Array.isArray(messages) || !messages.length) {
        return res.status(400).json({ error: "userId and non-empty messages array required" });
    }

    const date = new Date().toISOString().slice(0, 10);
    const key = `conv:${userId}:${date}`;
    await redis.rpush(key, JSON.stringify({ timestamp: Date.now(), messages }));
    console.log(`Conversation saved: ${key} (${messages.length} messages)`);
    res.json({ ok: true });
});

app.get("/conversations/:date", checkSecret, async (req, res) => {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }

    // Scan for all conv:*:{date} keys
    const pattern = `conv:*:${date}`;
    let cursor = 0;
    const allKeys = [];
    do {
        const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
        cursor = Number(nextCursor);
        allKeys.push(...keys);
    } while (cursor !== 0);

    const results = {};
    for (const key of allKeys) {
        const entries = await redis.lrange(key, 0, -1);
        results[key] = entries.map((e) => typeof e === "string" ? JSON.parse(e) : e);
    }

    res.json({ date, conversations: results });
});

// ── Daily digest ─────────────────────────────────────────────────────────────

const DIGEST_PROMPT = fs.readFileSync(path.join(PROMPTS_DIR, "digest_prompt.txt"), "utf8").trim();

app.post("/digest", checkSecret, async (req, res) => {
    const date = req.body.date || new Date(Date.now() - 86400000).toISOString().slice(0, 10); // default: yesterday

    // Collect all conversations for the date
    const pattern = `conv:*:${date}`;
    let cursor = 0;
    const allKeys = [];
    do {
        const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
        cursor = Number(nextCursor);
        allKeys.push(...keys);
    } while (cursor !== 0);

    if (!allKeys.length) {
        return res.json({ date, digest: "No conversations found for this date." });
    }

    const allConversations = [];
    for (const key of allKeys) {
        const entries = await redis.lrange(key, 0, -1);
        for (const entry of entries) {
            const parsed = typeof entry === "string" ? JSON.parse(entry) : entry;
            allConversations.push({ key, ...parsed });
        }
    }

    // Format conversations for LLM
    const conversationText = allConversations.map((conv, i) => {
        const msgs = conv.messages.map(m => `${m.role}: ${m.content}`).join("\n");
        return `--- Conversation ${i + 1} (${conv.key}) ---\n${msgs}`;
    }).join("\n\n");

    try {
        const llmRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://llm-highlighter.local",
                "X-Title": "LLM Highlighter Digest",
            },
            body: JSON.stringify({
                model: "deepseek/deepseek-v3.2",
                messages: [
                    { role: "system", content: DIGEST_PROMPT },
                    { role: "user", content: `Date: ${date}\n\n${conversationText}` },
                ],
                max_tokens: 1024,
                temperature: 0.3,
            }),
        });

        if (!llmRes.ok) {
            const errText = await llmRes.text();
            return res.status(502).json({ error: `OpenRouter error: ${llmRes.status}`, details: errText });
        }

        const llmData = await llmRes.json();
        const digest = llmData.choices?.[0]?.message?.content || "No digest generated.";

        // Append to knowledge_digest (append-only log)
        const existingDigest = (await redis.get(DIGEST_KEY)) || "";
        const newDigest = existingDigest
            ? `${existingDigest}\n\n--- ${date} ---\n${digest}`
            : `--- ${date} ---\n${digest}`;
        await redis.set(DIGEST_KEY, newDigest);

        console.log(`Digest generated for ${date} (${allConversations.length} conversations)`);
        res.json({ date, conversationCount: allConversations.length, digest });
    } catch (err) {
        console.error("Digest error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

init()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`LLM Highlighter backend running on http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error("Init failed:", err);
        process.exit(1);
    });
