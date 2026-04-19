// ─── Dev defaults (overridden by Options page settings) ──────────────────────
const DEFAULTS = {
    backendUrl: "http://localhost:3000",
    secret: "",
    model: "minimax/minimax-m2.7",
    systemPrompt:
        "You are a helpful customer service representative. Reply professionally and concisely to the customer message.",
};
// ─────────────────────────────────────────────────────────────────────────────

(() => {
    let floatingBtn = null;
    let responsePanel = null;
    let lastRange = null;

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

    function createBtn(x, y) {
        removeBtn();
        floatingBtn = document.createElement("button");
        floatingBtn.id = "llm-highlighter-btn";
        floatingBtn.innerHTML =
            '<span class="spinner"></span><span class="btn-icon">✨</span><span class="btn-label">Generate Reply</span>';
        floatingBtn.style.left = `${Math.min(x, window.innerWidth - 180)}px`;
        floatingBtn.style.top = `${y + window.scrollY - 70}px`;

        floatingBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            handleGenerate();
        });

        document.body.appendChild(floatingBtn);
    }

    function showResponse(x, y, text, isError) {
        removeResponse();
        responsePanel = document.createElement("div");
        responsePanel.id = "llm-highlighter-response";
        responsePanel.style.left = `${Math.min(x, window.innerWidth - 440)}px`;
        responsePanel.style.top = `${y + window.scrollY - 10}px`;

        responsePanel.innerHTML = `
      <div class="response-header">
        <span>AI Reply</span>
        <button class="response-close" title="Close">×</button>
      </div>
      <div class="response-text ${isError ? "response-error" : ""}">${escapeHtml(text)}</div>
      ${!isError ? '<button class="response-copy-btn">Copy</button>' : ""}
    `;

        responsePanel
            .querySelector(".response-close")
            .addEventListener("click", removeResponse);

        if (!isError) {
            const copyBtn = responsePanel.querySelector(".response-copy-btn");
            copyBtn.addEventListener("click", () => {
                navigator.clipboard.writeText(text).then(() => {
                    copyBtn.textContent = "Copied!";
                    copyBtn.classList.add("copied");
                    setTimeout(() => {
                        copyBtn.textContent = "Copy";
                        copyBtn.classList.remove("copied");
                    }, 2000);
                });
            });
        }

        document.body.appendChild(responsePanel);
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    async function handleGenerate() {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        if (!selectedText) return;

        const rect = lastRange
            ? lastRange.getBoundingClientRect()
            : { left: 100, bottom: 100 };

        floatingBtn.classList.add("loading");
        floatingBtn.querySelector(".btn-label").textContent = "Generating...";

        const settings = await getSettings();

        chrome.runtime.sendMessage(
            {
                type: "GENERATE",
                payload: {
                    selectedText,
                    systemPrompt: settings.systemPrompt,
                    backendUrl: settings.backendUrl,
                    secret: settings.secret,
                },
            },
            (response) => {
                removeBtn();
                if (chrome.runtime.lastError) {
                    showResponse(
                        rect.left,
                        rect.bottom,
                        `Error: ${chrome.runtime.lastError.message}`,
                        true,
                    );
                    return;
                }
                if (response.error) {
                    showResponse(
                        rect.left,
                        rect.bottom,
                        `Error: ${response.error}`,
                        true,
                    );
                } else {
                    showResponse(rect.left, rect.bottom, response.text, false);
                }
            },
        );
    }

    function getSettings() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(DEFAULTS, resolve);
        });
    }

    document.addEventListener("mouseup", (e) => {
        // Small delay so selection is finalized
        setTimeout(() => {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (!text || text.length < 2) {
                removeBtn();
                return;
            }

            // Don't show button inside our own panels
            if (
                (floatingBtn && floatingBtn.contains(e.target)) ||
                (responsePanel && responsePanel.contains(e.target))
            ) {
                return;
            }

            try {
                lastRange = selection.getRangeAt(0);
                const rect = lastRange.getBoundingClientRect();
                createBtn(rect.left, rect.bottom);
            } catch (_) {
                // ignore
            }
        }, 10);
    });

    document.addEventListener("mousedown", (e) => {
        if (floatingBtn && !floatingBtn.contains(e.target)) {
            removeBtn();
        }
        if (responsePanel && !responsePanel.contains(e.target)) {
            removeResponse();
        }
    });

    // Clean up on scroll to avoid misalignment
    window.addEventListener(
        "scroll",
        () => {
            removeBtn();
        },
        { passive: true },
    );
})();
