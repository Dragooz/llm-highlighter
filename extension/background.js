chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GENERATE') {
    const { selectedText, systemPrompt, backendUrl, secret } = message.payload;

    const url = `${backendUrl.replace(/\/$/, '')}/generate`;
    const headers = { 'Content-Type': 'application/json' };
    if (secret) headers['X-Secret'] = secret;

    fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: selectedText, systemPrompt }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.text().then((t) => {
            throw new Error(`Backend ${res.status}: ${t}`);
          });
        }
        return res.json();
      })
      .then((data) => sendResponse({ text: data.response }))
      .catch((err) => sendResponse({ error: err.message }));

    return true; // keep channel open for async response
  }
});
