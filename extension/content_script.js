// ─── Dev defaults (overridden by Options page settings) ──────────────────────
const DEFAULTS = {
    backendUrl: "https://llm-highlighter-production.up.railway.app",
    secret: "",
    model: "deepseek/deepseek-v3.2",
};
// ─────────────────────────────────────────────────────────────────────────────

(() => {
    let floatingBtn = null;
    let responsePanel = null;
    let faqPanel = null;
    let lastRange = null;
    let lastQuestion = ""; // the highlighted text from the last generation
    let lastStreamedText = ""; // accumulated stream text for copy/faq

    // ── cleanup helpers ──────────────────────────────────────────────────────

    function removeBtn() {
        if (floatingBtn) {
            floatingBtn.remove();
            floatingBtn = null;
        }
    }
    function removeResponse() {
        if (responsePanel) {
            responsePanel.remove();
            responsePanel = null;
        }
    }
    function removeFaqPanel() {
        if (faqPanel) {
            faqPanel.remove();
            faqPanel = null;
        }
    }

    // ── floating button ──────────────────────────────────────────────────────

    function createBtn(x, y) {
        removeBtn();
        floatingBtn = document.createElement("div");
        floatingBtn.id = "llm-highlighter-btn-group";
        floatingBtn.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
        floatingBtn.style.top = `${y - 40}px`;

        floatingBtn.innerHTML = `
            <button id="llm-highlighter-btn" title="Generate reply">
                <span class="spinner"></span>
                <span class="btn-icon">✨</span>
                <span class="btn-label">Generate Reply</span>
            </button>
            <button id="llm-highlighter-faq-trigger-btn" title="Add to FAQ">
                <span>📋</span><span class="faq-trigger-label">Add to FAQ</span>
            </button>
        `;

        floatingBtn
            .querySelector("#llm-highlighter-btn")
            .addEventListener("click", (e) => {
                e.stopPropagation();
                handleGenerate();
            });

        floatingBtn
            .querySelector("#llm-highlighter-faq-trigger-btn")
            .addEventListener("click", (e) => {
                e.stopPropagation();
                const selectedText = window.getSelection().toString().trim();
                showFaqPanel(x, y, selectedText);
            });

        document.body.appendChild(floatingBtn);
    }

    // ── response panel ───────────────────────────────────────────────────────

    function showResponse(x, y, text, isError, streaming = false) {
        removeResponse();
        lastStreamedText = text;
        responsePanel = document.createElement("div");
        responsePanel.id = "llm-highlighter-response";

        // position is fixed, so coords are viewport-relative — no scrollY needed
        const panelW = 420;
        const panelH = Math.min(window.innerHeight * 0.6, 400); // approx max-height
        const margin = 8;
        const left = Math.min(x, window.innerWidth - panelW - margin);
        // try below selection; if it clips bottom, show above instead
        let top = y + 10;
        if (top + panelH > window.innerHeight - margin) {
            top = Math.max(margin, y - panelH - 10);
        }

        responsePanel.style.left = `${Math.max(margin, left)}px`;
        responsePanel.style.top = `${top}px`;

        responsePanel.innerHTML = `
            <div class="response-header">
                <span>AI Reply</span>
                <button class="response-close" title="Close">×</button>
            </div>
            ${streaming ? `<div class="response-loading"><span class="response-spinner"></span><span>Thinking…</span></div>` : ""}
            <div class="response-text ${isError ? "response-error" : ""}">${escapeHtml(text)}</div>
            ${
                !isError
                    ? `
                <div class="response-actions" style="display:${streaming ? "none" : "flex"}">
                    <button class="response-copy-btn">Copy</button>
                    <button class="response-faq-btn" title="Add to FAQ or flag as unhelpful">👎 Not helpful / Add to FAQ</button>
                </div>
            `
                    : ""
            }
        `;

        responsePanel
            .querySelector(".response-close")
            .addEventListener("click", () => {
                removeResponse();
                removeFaqPanel();
            });

        if (!isError) {
            const copyBtn = responsePanel.querySelector(".response-copy-btn");
            copyBtn.addEventListener("click", () => {
                const fullText =
                    responsePanel.querySelector(".response-text").textContent;
                navigator.clipboard.writeText(fullText).then(() => {
                    copyBtn.textContent = "Copied!";
                    copyBtn.classList.add("copied");
                    setTimeout(() => {
                        copyBtn.textContent = "Copy";
                        copyBtn.classList.remove("copied");
                    }, 2000);
                });
            });

            responsePanel
                .querySelector(".response-faq-btn")
                .addEventListener("click", (e) => {
                    e.stopPropagation();
                    showFaqPanel(x, y, lastQuestion);
                });
        }

        document.body.appendChild(responsePanel);
    }

    // ── faq feedback panel ───────────────────────────────────────────────────

    function showFaqPanel(x, y, question) {
        if (faqPanel) {
            removeFaqPanel();
            return;
        }

        faqPanel = document.createElement("div");
        faqPanel.id = "llm-highlighter-faq-panel";
        const faqLeft = Math.min(x, window.innerWidth - 440 - 8);
        const faqTop = Math.min(y + 10, window.innerHeight - 320 - 8);
        faqPanel.style.left = `${Math.max(8, faqLeft)}px`;
        faqPanel.style.top = `${Math.max(8, faqTop)}px`;

        faqPanel.innerHTML = `
            <div class="faq-header">
                <span>Add to FAQ</span>
                <button class="faq-close">×</button>
            </div>
            <label class="faq-label">Question (what was highlighted)</label>
            <textarea class="faq-question" rows="2">${escapeHtml(question || "")}</textarea>
            <label class="faq-label">Correct / expected answer</label>
            <textarea class="faq-answer" rows="4" placeholder="Type the ideal answer here..."></textarea>
            <div class="faq-footer">
                <button class="faq-submit">Save to FAQ</button>
                <span class="faq-msg"></span>
            </div>
        `;

        faqPanel.querySelector(".faq-close").addEventListener("click", (e) => {
            e.stopPropagation();
            removeFaqPanel();
        });

        faqPanel
            .querySelector(".faq-submit")
            .addEventListener("click", async (e) => {
                e.stopPropagation();
                const question = faqPanel
                    .querySelector(".faq-question")
                    .value.trim();
                const answer = faqPanel
                    .querySelector(".faq-answer")
                    .value.trim();
                if (!question || !answer) return;

                const settings = await getSettings();
                const btn = faqPanel.querySelector(".faq-submit");
                btn.disabled = true;
                btn.textContent = "Saving...";

                chrome.runtime.sendMessage(
                    {
                        type: "ADD_FAQ",
                        payload: {
                            question,
                            answer,
                            backendUrl: settings.backendUrl,
                            secret: settings.secret,
                        },
                    },
                    (response) => {
                        const msg = faqPanel.querySelector(".faq-msg");
                        if (chrome.runtime.lastError || response.error) {
                            msg.textContent = "❌ Failed to save";
                            msg.style.color = "#dc2626";
                            btn.disabled = false;
                            btn.textContent = "Save to FAQ";
                        } else {
                            msg.textContent = "✓ Saved to FAQ";
                            msg.style.color = "#16a34a";
                            setTimeout(removeFaqPanel, 1500);
                        }
                    },
                );
            });

        document.body.appendChild(faqPanel);
    }

    // ── generate ─────────────────────────────────────────────────────────────

    async function handleGenerate() {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        if (!selectedText) return;

        lastQuestion = selectedText;

        const rect = lastRange
            ? lastRange.getBoundingClientRect()
            : { left: 100, bottom: 100 };

        const generateBtn = floatingBtn.querySelector("#llm-highlighter-btn");
        generateBtn.classList.add("loading");
        generateBtn.querySelector(".btn-label").textContent = "Generating...";

        const settings = await getSettings();

        // Show empty streaming panel immediately
        showResponse(rect.left, rect.bottom, "", false, true);

        chrome.runtime.sendMessage({
            type: "GENERATE",
            payload: {
                selectedText,
                backendUrl: settings.backendUrl,
                secret: settings.secret,
                model: settings.model,
            },
        });

        removeBtn();
        removeFaqPanel();
    }

    // ── stream message listener ───────────────────────────────────────────────

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === "STREAM_CHUNK") {
            if (!responsePanel) return;
            // hide spinner on first chunk
            const loader = responsePanel.querySelector(".response-loading");
            if (loader) loader.remove();
            const textEl = responsePanel.querySelector(".response-text");
            if (textEl) {
                textEl.textContent += message.delta;
                // auto-scroll to bottom
                textEl.scrollTop = textEl.scrollHeight;
            }
        } else if (message.type === "STREAM_DONE") {
            if (!responsePanel) return;
            // reveal actions bar
            const actions = responsePanel.querySelector(".response-actions");
            if (actions) actions.style.display = "flex";
            // store full text for copy/faq
            const textEl = responsePanel.querySelector(".response-text");
            if (textEl) lastStreamedText = textEl.textContent;
        } else if (message.type === "STREAM_ERROR") {
            showResponse(100, 100, `Error: ${message.error}`, true, false);
        }
    });

    // ── helpers ───────────────────────────────────────────────────────────────

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

    // ── event listeners ───────────────────────────────────────────────────────

    document.addEventListener("mouseup", (e) => {
        setTimeout(() => {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (!text || text.length < 2) {
                removeBtn();
                return;
            }

            if (
                (floatingBtn && floatingBtn.contains(e.target)) ||
                (responsePanel && responsePanel.contains(e.target)) ||
                (faqPanel && faqPanel.contains(e.target))
            )
                return;

            try {
                lastRange = selection.getRangeAt(0);
                const rect = lastRange.getBoundingClientRect();
                createBtn(rect.left, rect.bottom);
            } catch (_) {
                /* ignore */
            }
        }, 10);
    });

    document.addEventListener("mousedown", (e) => {
        if (floatingBtn && !floatingBtn.contains(e.target)) removeBtn();
        if (
            responsePanel &&
            !responsePanel.contains(e.target) &&
            !(faqPanel && faqPanel.contains(e.target))
        ) {
            removeResponse();
            removeFaqPanel();
        }
        if (
            faqPanel &&
            !faqPanel.contains(e.target) &&
            !(responsePanel && responsePanel.contains(e.target))
        ) {
            removeFaqPanel();
        }
    });

    window.addEventListener(
        "scroll",
        () => {
            removeBtn();
        },
        { passive: true },
    );
})();
