// Auto-generate userId on first install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ userId: '' }, (data) => {
    if (!data.userId) {
      const userId = crypto.randomUUID();
      chrome.storage.sync.set({ userId });
      console.log('Generated userId:', userId);
    }
  });
});

// ── Shared streaming fetch with fallback ────────────────────────────────────

async function streamGenerate({ base, headers, messages, model, fallbackModel, tabId, chunkType, doneType, errorType }) {
  const attempt = async (useModel) => {
    const res = await fetch(`${base}/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages, model: useModel }),
    });

    if (!res.ok) {
      const t = await res.text();
      // Retry with fallback on 4xx/502 (model-related errors)
      if (fallbackModel && useModel !== fallbackModel && (res.status >= 400 && res.status < 500 || res.status === 502)) {
        console.warn(`Model ${useModel} failed (${res.status}), falling back to ${fallbackModel}`);
        return attempt(fallbackModel);
      }
      chrome.tabs.sendMessage(tabId, { type: errorType, error: `Backend ${res.status}: ${t}` });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          chrome.tabs.sendMessage(tabId, { type: doneType });
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            chrome.tabs.sendMessage(tabId, { type: errorType, error: parsed.error });
          } else if (parsed.delta) {
            chrome.tabs.sendMessage(tabId, { type: chunkType, delta: parsed.delta });
          }
        } catch (_) { /* skip malformed */ }
      }
    }
  };

  try {
    await attempt(model);
  } catch (err) {
    if (tabId) chrome.tabs.sendMessage(tabId, { type: errorType, error: err.message });
  }
}

// ── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { backendUrl, secret } = message.payload || {};
  const base = (backendUrl || 'https://llm-highlighter-production.up.railway.app').replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Secret'] = secret;

  if (message.type === 'GENERATE') {
    const { messages, model, fallbackModel } = message.payload;
    const tabId = sender.tab?.id;

    streamGenerate({
      base, headers, messages, model, fallbackModel, tabId,
      chunkType: 'STREAM_CHUNK',
      doneType: 'STREAM_DONE',
      errorType: 'STREAM_ERROR',
    });

    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'GENERATE_HIGHLIGHT') {
    const { selectedText, model, fallbackModel } = message.payload;
    const tabId = sender.tab?.id;
    const msgs = [{ role: 'user', content: selectedText }];

    streamGenerate({
      base, headers, messages: msgs, model, fallbackModel, tabId,
      chunkType: 'HIGHLIGHT_CHUNK',
      doneType: 'HIGHLIGHT_DONE',
      errorType: 'HIGHLIGHT_ERROR',
    });

    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'ADD_FAQ') {
    const { question, answer } = message.payload;

    fetch(`${base}/faq`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question, answer }),
    })
      .then((res) => {
        if (!res.ok) return res.text().then((t) => { throw new Error(`Backend ${res.status}: ${t}`); });
        return res.json();
      })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));

    return true;
  }

  if (message.type === 'SAVE_CONVERSATION') {
    const { userId, messages } = message.payload;

    fetch(`${base}/conversations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId, messages }),
    })
      .then((res) => {
        if (!res.ok) console.error('Failed to save conversation:', res.status);
      })
      .catch((err) => console.error('Failed to save conversation:', err.message));

    sendResponse({ ok: true });
    return true;
  }
});
