// service worker, the brain of the extension

const PROXY_URL = "https://ai-summarizer-proxy.vercel.app/api/summarize";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "summarize") {
    handleSummarize(message.data).then(sendResponse);
    return true; // keeps channel open for async response
  }
});

async function handleSummarize({ content, title, url }) {
  // Check cache first
  const cached = await chrome.storage.local.get(url);
  if (cached[url]) {
    return { summary: cached[url], cached: true };
  }

  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, title }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { error: err.error || `Server error: ${response.status}` };
    }

    const summary = await response.json();

    // Save to cache
    await chrome.storage.local.set({ [url]: summary });

    return { summary, cached: false };
  } catch (err) {
    return { error: "Could not reach the server. Check your connection." };
  }
}