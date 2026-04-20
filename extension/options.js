const DEFAULT_SYSTEM_PROMPT = `You are a helpful customer service representative.
Reply professionally, empathetically, and concisely to the customer's message.
Keep responses under 3 sentences unless more detail is clearly needed.
Do not use overly formal language — be warm and human.`;

const DEFAULT_BACKEND_URL = "https://llm-highlighter-production.up.railway.app";

function loadSettings() {
    chrome.storage.sync.get(
        {
            backendUrl: DEFAULT_BACKEND_URL,
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            secret: "",
            model: "minimax/minimax-m2.7",
        },
        (settings) => {
            document.getElementById("backend-url").value = settings.backendUrl;
            document.getElementById("system-prompt").value =
                settings.systemPrompt;
            document.getElementById("secret").value = settings.secret;
            document.getElementById("model").value = settings.model;
        },
    );
}

function saveSettings() {
    const settings = {
        backendUrl:
            document.getElementById("backend-url").value.trim() ||
            DEFAULT_BACKEND_URL,
        systemPrompt:
            document.getElementById("system-prompt").value.trim() ||
            DEFAULT_SYSTEM_PROMPT,
        secret: document.getElementById("secret").value.trim(),
        model: document.getElementById("model").value,
    };

    chrome.storage.sync.set(settings, () => {
        const msg = document.getElementById("saved-msg");
        msg.classList.add("visible");
        setTimeout(() => msg.classList.remove("visible"), 2500);
    });
}

document.getElementById("save-btn").addEventListener("click", saveSettings);
document.addEventListener("DOMContentLoaded", loadSettings);
loadSettings();
