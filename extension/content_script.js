// ─── Swipey Chat Widget ─────────────────────────────────────────────────────
const DEFAULTS = {
    backendUrl: "https://llm-highlighter-production.up.railway.app",
    secret: "",
    model: "deepseek/deepseek-v3.2",
};

(() => {
    let chatOpen = false;
    let messages = []; // {role: "user"|"assistant", content: string}
    let streaming = false;
    let widget = null;

    // ── settings helpers ──────────────────────────────────────────────────────

    function getSettings() {
        return new Promise((resolve) =>
            chrome.storage.sync.get(DEFAULTS, resolve),
        );
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // ── build widget ──────────────────────────────────────────────────────────

    function createWidget() {
        widget = document.createElement("div");
        widget.id = "swipey-chat-widget";
        widget.innerHTML = `
            <button id="swipey-chat-toggle" title="Swipey Chat">
                <img src="${chrome.runtime.getURL("swipey-logo.png")}" width="30" height="30" alt="Swipey" style="border-radius:50%;" />
            </button>
            <div id="swipey-chat-panel" class="swipey-hidden">
                <div class="swipey-header">
                    <span class="swipey-title">Swipey Chat</span>
                    <div class="swipey-header-actions">
                        <button class="swipey-clear-btn" title="Clear conversation">Clear</button>
                        <button class="swipey-close-btn" title="Close">&times;</button>
                    </div>
                </div>
                <div id="swipey-messages"></div>
                <div class="swipey-input-row">
                    <textarea id="swipey-input" placeholder="Ask something..." rows="1"></textarea>
                    <button id="swipey-send" title="Send">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(widget);

        // restore open state
        chrome.storage.local.get({ chatOpen: false }, (data) => {
            if (data.chatOpen) toggleChat(true);
        });

        // event listeners
        widget.querySelector("#swipey-chat-toggle").addEventListener("click", () => toggleChat());
        widget.querySelector(".swipey-close-btn").addEventListener("click", () => toggleChat(false));
        widget.querySelector(".swipey-clear-btn").addEventListener("click", clearConversation);
        widget.querySelector("#swipey-send").addEventListener("click", sendMessage);

        const input = widget.querySelector("#swipey-input");
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        // auto-resize textarea
        input.addEventListener("input", () => {
            input.style.height = "auto";
            input.style.height = Math.min(input.scrollHeight, 100) + "px";
        });
    }

    function toggleChat(forceState) {
        const panel = widget.querySelector("#swipey-chat-panel");
        const toggle = widget.querySelector("#swipey-chat-toggle");
        chatOpen = forceState !== undefined ? forceState : !chatOpen;
        panel.classList.toggle("swipey-hidden", !chatOpen);
        toggle.classList.toggle("swipey-toggle-active", chatOpen);
        chrome.storage.local.set({ chatOpen });
        if (chatOpen) {
            widget.querySelector("#swipey-input").focus();
            scrollToBottom();
        }
    }

    function clearConversation() {
        messages = [];
        renderMessages();
    }

    // ── messages ──────────────────────────────────────────────────────────────

    function renderMessages() {
        const container = widget.querySelector("#swipey-messages");
        if (!messages.length) {
            container.innerHTML = '<div class="swipey-empty">Ask a question about Swipey products or customer issues.</div>';
            return;
        }
        container.innerHTML = messages.map((msg, i) => {
            const cls = msg.role === "user" ? "swipey-msg-user" : "swipey-msg-ai";
            const copyBtn = msg.role === "assistant"
                ? `<button class="swipey-copy-btn" data-idx="${i}" title="Copy">Copy</button>`
                : "";
            return `<div class="swipey-msg ${cls}">
                <div class="swipey-msg-content">${escapeHtml(msg.content)}</div>
                ${copyBtn}
            </div>`;
        }).join("");

        // copy handlers
        container.querySelectorAll(".swipey-copy-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const idx = parseInt(btn.dataset.idx);
                navigator.clipboard.writeText(messages[idx].content).then(() => {
                    btn.textContent = "Copied!";
                    btn.classList.add("copied");
                    setTimeout(() => {
                        btn.textContent = "Copy";
                        btn.classList.remove("copied");
                    }, 2000);
                });
            });
        });

        scrollToBottom();
    }

    function scrollToBottom() {
        const container = widget.querySelector("#swipey-messages");
        if (container) container.scrollTop = container.scrollHeight;
    }

    function appendStreamDelta(delta) {
        if (!messages.length || messages[messages.length - 1].role !== "assistant") return;
        messages[messages.length - 1].content += delta;

        // update last message bubble directly for perf
        const container = widget.querySelector("#swipey-messages");
        const lastMsg = container.querySelector(".swipey-msg:last-child .swipey-msg-content");
        if (lastMsg) {
            lastMsg.textContent = messages[messages.length - 1].content;
            scrollToBottom();
        }
    }

    // ── send ──────────────────────────────────────────────────────────────────

    async function sendMessage() {
        if (streaming) return;
        const input = widget.querySelector("#swipey-input");
        const text = input.value.trim();
        if (!text) return;

        messages.push({ role: "user", content: text });
        messages.push({ role: "assistant", content: "" });
        input.value = "";
        input.style.height = "auto";
        renderMessages();

        // show spinner on last msg
        const container = widget.querySelector("#swipey-messages");
        const lastMsg = container.querySelector(".swipey-msg:last-child");
        if (lastMsg) {
            lastMsg.querySelector(".swipey-msg-content").innerHTML = '<span class="swipey-thinking">Thinking...</span>';
        }

        streaming = true;
        const settings = await getSettings();

        chrome.runtime.sendMessage({
            type: "GENERATE",
            payload: {
                messages: messages.slice(0, -1), // all except empty assistant placeholder
                backendUrl: settings.backendUrl,
                secret: settings.secret,
                model: settings.model,
            },
        });
    }

    // ── stream listener ──────────────────────────────────────────────────────

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === "STREAM_CHUNK") {
            // clear "Thinking..." on first chunk
            if (messages.length && messages[messages.length - 1].content === "") {
                const container = widget.querySelector("#swipey-messages");
                const lastContent = container.querySelector(".swipey-msg:last-child .swipey-msg-content");
                if (lastContent) lastContent.textContent = "";
            }
            appendStreamDelta(message.delta);
        } else if (message.type === "STREAM_DONE") {
            streaming = false;
            renderMessages(); // re-render to add copy button
        } else if (message.type === "STREAM_ERROR") {
            streaming = false;
            if (messages.length && messages[messages.length - 1].role === "assistant") {
                messages[messages.length - 1].content = `Error: ${message.error}`;
            }
            renderMessages();
        }
    });

    // ── save conversation on page unload ──────────────────────────────────────

    window.addEventListener("beforeunload", () => {
        if (messages.length > 0) {
            chrome.storage.sync.get({ userId: "" }, (data) => {
                if (!data.userId) return;
                chrome.runtime.sendMessage({
                    type: "SAVE_CONVERSATION",
                    payload: {
                        userId: data.userId,
                        messages,
                    },
                });
            });
        }
    });

    // ── init ──────────────────────────────────────────────────────────────────

    createWidget();
})();
