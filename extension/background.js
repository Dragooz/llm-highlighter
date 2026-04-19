chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { backendUrl, secret } = message.payload || {};
  const base = (backendUrl || 'http://localhost:3000').replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Secret'] = secret;

  if (message.type === 'GENERATE') {
    const { selectedText, model } = message.payload;

    fetch(`${base}/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: selectedText, model }),
    })
      .then((res) => {
        if (!res.ok) return res.text().then((t) => { throw new Error(`Backend ${res.status}: ${t}`); });
        return res.json();
      })
      .then((data) => sendResponse({ text: data.response }))
      .catch((err) => sendResponse({ error: err.message }));

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
