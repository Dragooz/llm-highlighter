chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { backendUrl, secret } = message.payload || {};
  const base = (backendUrl || 'https://llm-highlighter-production.up.railway.app').replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Secret'] = secret;

  if (message.type === 'GENERATE') {
    const { selectedText, model } = message.payload;
    const tabId = sender.tab?.id;

    fetch(`${base}/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: selectedText, model }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const t = await res.text();
          chrome.tabs.sendMessage(tabId, { type: 'STREAM_ERROR', error: `Backend ${res.status}: ${t}` });
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
              chrome.tabs.sendMessage(tabId, { type: 'STREAM_DONE' });
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                chrome.tabs.sendMessage(tabId, { type: 'STREAM_ERROR', error: parsed.error });
              } else if (parsed.delta) {
                chrome.tabs.sendMessage(tabId, { type: 'STREAM_CHUNK', delta: parsed.delta });
              }
            } catch (_) { /* skip malformed */ }
          }
        }
      })
      .catch((err) => {
        if (tabId) chrome.tabs.sendMessage(tabId, { type: 'STREAM_ERROR', error: err.message });
      });

    sendResponse({ ok: true }); // acknowledge immediately
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
});
