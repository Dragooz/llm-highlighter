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
    let conversations = []; // stored conversation list
    let activeConvId = null;
    let convListOpen = false;
    const MAX_CONVERSATIONS = 10;

    // ── fun text pools ────────────────────────────────────────────────────────

    const GREETINGS = [
        "What chaos are we solving today?",
        "Paste the customer drama, I got you.",
        "Ready when you are. Hit me.",
        "Another day, another query. Let's go!",
        "Your friendly neighbourhood answer machine. Ask away!",
        "Copy-paste the question, I'll dig up the goods.",
        "What's the customer confused about this time?",
    ];

    const THINKING = [
        "Digging through the vault...",
        "Consulting the scrolls...",
        "On it, boss...",
        "Rummaging through the brain...",
        "Let me cook...",
        "Searching the archives...",
        "Give me a sec, I'm speed-reading...",
    ];

    const COPY_REACTIONS = [
        "Yoinked!",
        "Snatched!",
        "Ready to send!",
        "Grabbed it!",
        "In your clipboard!",
        "Copy that! (pun intended)",
    ];

    function randomFrom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

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

    // ── conversation storage ────────────────────────────────────────────────

    function loadConversations() {
        return new Promise((resolve) => {
            chrome.storage.local.get({ conversations: [], activeConvId: null }, (data) => {
                conversations = data.conversations;
                activeConvId = data.activeConvId;
                resolve();
            });
        });
    }

    function persistConversations() {
        chrome.storage.local.set({ conversations, activeConvId });
    }

    function saveCurrentConversation() {
        if (!messages.length) return;
        if (!activeConvId) {
            activeConvId = "conv_" + Date.now();
        }
        const firstUserMsg = messages.find((m) => m.role === "user");
        const title = firstUserMsg
            ? firstUserMsg.content.slice(0, 40)
            : "New conversation";
        const idx = conversations.findIndex((c) => c.id === activeConvId);
        const conv = { id: activeConvId, title, messages: [...messages], updatedAt: Date.now() };
        if (idx >= 0) {
            conversations[idx] = conv;
        } else {
            conversations.push(conv);
        }
        // FIFO: drop oldest beyond max
        if (conversations.length > MAX_CONVERSATIONS) {
            conversations.sort((a, b) => b.updatedAt - a.updatedAt);
            conversations = conversations.slice(0, MAX_CONVERSATIONS);
        }
        persistConversations();
    }

    function startNewConversation() {
        saveCurrentConversation();
        messages = [];
        activeConvId = null;
        persistConversations();
        renderMessages();
        if (convListOpen) toggleConvList(false);
    }

    function loadConversation(id) {
        saveCurrentConversation();
        const conv = conversations.find((c) => c.id === id);
        if (conv) {
            messages = [...conv.messages];
            activeConvId = conv.id;
            persistConversations();
            renderMessages();
        }
        if (convListOpen) toggleConvList(false);
    }

    function deleteConversation(id) {
        conversations = conversations.filter((c) => c.id !== id);
        if (activeConvId === id) {
            // load most recent or clear
            if (conversations.length) {
                conversations.sort((a, b) => b.updatedAt - a.updatedAt);
                const latest = conversations[0];
                messages = [...latest.messages];
                activeConvId = latest.id;
            } else {
                messages = [];
                activeConvId = null;
            }
            renderMessages();
        }
        persistConversations();
        renderConvList();
    }

    function relativeTime(ts) {
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 60) return "just now";
        if (diff < 3600) return Math.floor(diff / 60) + "m ago";
        if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
        return Math.floor(diff / 86400) + "d ago";
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
                        <button class="swipey-history-btn" title="Conversation history">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                        </button>
                        <button class="swipey-newchat-btn" title="New conversation">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                        <button class="swipey-close-btn" title="Close">&times;</button>
                    </div>
                </div>
                <div id="swipey-conv-list" class="swipey-hidden"></div>
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
        widget.querySelector(".swipey-newchat-btn").addEventListener("click", startNewConversation);
        widget.querySelector(".swipey-history-btn").addEventListener("click", () => toggleConvList());
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

    // ── conversation list panel ────────────────────────────────────────────

    function toggleConvList(forceState) {
        const list = widget.querySelector("#swipey-conv-list");
        const msgs = widget.querySelector("#swipey-messages");
        convListOpen = forceState !== undefined ? forceState : !convListOpen;
        list.classList.toggle("swipey-hidden", !convListOpen);
        msgs.classList.toggle("swipey-hidden", convListOpen);
        if (convListOpen) renderConvList();
    }

    function renderConvList() {
        const list = widget.querySelector("#swipey-conv-list");
        const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
        if (!sorted.length) {
            list.innerHTML = `<div class="swipey-empty">No conversations yet</div>`;
            return;
        }
        list.innerHTML = sorted.map((conv) => {
            const active = conv.id === activeConvId ? " swipey-conv-active" : "";
            return `<div class="swipey-conv-item${active}" data-id="${conv.id}">
                <div class="swipey-conv-info">
                    <span class="swipey-conv-title">${escapeHtml(conv.title)}</span>
                    <span class="swipey-conv-time">${relativeTime(conv.updatedAt)}</span>
                </div>
                <button class="swipey-conv-delete" data-id="${conv.id}" title="Delete">&times;</button>
            </div>`;
        }).join("");

        list.querySelectorAll(".swipey-conv-item").forEach((item) => {
            item.addEventListener("click", (e) => {
                if (e.target.closest(".swipey-conv-delete")) return;
                loadConversation(item.dataset.id);
            });
        });
        list.querySelectorAll(".swipey-conv-delete").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                deleteConversation(btn.dataset.id);
            });
        });
    }

    // ── messages ──────────────────────────────────────────────────────────────

    function renderMessages() {
        const container = widget.querySelector("#swipey-messages");
        if (!messages.length) {
            container.innerHTML = `<div class="swipey-empty">${randomFrom(GREETINGS)}</div>`;
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
                    btn.textContent = randomFrom(COPY_REACTIONS);
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
            lastMsg.querySelector(".swipey-msg-content").innerHTML = `<span class="swipey-thinking">${randomFrom(THINKING)}</span>`;
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
            saveCurrentConversation(); // auto-save to local history
            saveConversation(); // auto-save to backend
        } else if (message.type === "STREAM_ERROR") {
            streaming = false;
            if (messages.length && messages[messages.length - 1].role === "assistant") {
                messages[messages.length - 1].content = `Error: ${message.error}`;
            }
            renderMessages();
        }
    });

    // ── save conversation ───────────────────────────────────────────────────────

    function saveConversation() {
        if (messages.length < 2) return; // need at least 1 exchange
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

    window.addEventListener("beforeunload", saveConversation);

    // ── init ──────────────────────────────────────────────────────────────────

    createWidget();
    loadConversations().then(() => {
        if (activeConvId) {
            const conv = conversations.find((c) => c.id === activeConvId);
            if (conv) {
                messages = [...conv.messages];
                renderMessages();
            }
        }
    });
})();
