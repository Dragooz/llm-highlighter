const DEFAULT_BACKEND_URL = "https://llm-highlighter-production.up.railway.app";

function loadSettings() {
    chrome.storage.sync.get(
        {
            backendUrl: DEFAULT_BACKEND_URL,
            secret: "",
            model: "deepseek/deepseek-v3.2",
        },
        (settings) => {
            document.getElementById("backend-url").value = settings.backendUrl;
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
