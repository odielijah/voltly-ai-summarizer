// runs inside every webpage, extracts readable content

function extractContent() {
  // These are "noise" elements we want to ignore
  const noiseSelectors = [
    "nav",
    "header",
    "footer",
    "aside",
    ".sidebar",
    ".ad",
    ".advertisement",
    ".banner",
    ".nav",
    ".menu",
    ".cookie",
    ".popup",
    "[role='navigation']",
    "[role='banner']",
    "[role='complementary']",
  ];

  // Remove noise elements from a cloned copy (don't touch the real page)
  const docClone = document.cloneNode(true);
  noiseSelectors.forEach((sel) => {
    docClone.querySelectorAll(sel).forEach((el) => el.remove());
  });

  // Try to find the main article content first
  const priority = [
    "article",
    "main",
    "[role='main']",
    ".post-content",
    ".article-body",
    ".entry-content",
    ".content",
  ];

  let contentEl = null;
  for (const sel of priority) {
    const el = docClone.querySelector(sel);
    if (el && el.innerText?.trim().length > 200) {
      contentEl = el;
      break;
    }
  }

  // If no article/main found, find the div with the most paragraph text
  if (!contentEl) {
    let bestEl = null;
    let bestLength = 0;

    docClone.querySelectorAll("div, section").forEach((el) => {
      const paragraphs = el.querySelectorAll("p");
      const text = Array.from(paragraphs)
        .map((p) => p.innerText)
        .join(" ")
        .trim();

      if (text.length > bestLength) {
        bestLength = text.length;
        bestEl = el;
      }
    });

    contentEl = bestEl;
  }

  // Extract and clean the text
  const rawText = contentEl?.innerText || document.body.innerText || "";
  const cleaned = rawText
    .replace(/\s+/g, " ") // collapse whitespace
    .replace(/\n{3,}/g, "\n\n") // max 2 consecutive newlines
    .trim()
    .slice(0, 15000); // cap at 15k chars so we don't overload Gemini

  return {
    content: cleaned,
    title: document.title,
    url: window.location.href,
  };
}

// Listen for message from background.js asking for content
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "extract") {
    sendResponse(extractContent());
  }

  if (message.action === "highlight") {
    highlightInsights(message.insights);
    sendResponse({ done: true });
  }

  return true;
});

function highlightInsights(insights) {
  // Remove existing highlights first
  document.querySelectorAll(".ai-summarizer-highlight").forEach((el) => {
    el.style.background = "";
    el.style.borderLeft = "";
    el.style.paddingLeft = "";
    el.style.borderRadius = "";
    el.classList.remove("ai-summarizer-highlight");
  });

  const paragraphs = document.querySelectorAll("p");

  // Extract meaningful keywords from all insights (ignore short/common words)
  const stopWords = new Set(["the","a","an","is","are","was","were","and","or",
    "but","in","on","at","to","for","of","with","by","from","that","this",
    "it","its","as","be","has","have","had","not","they","their","which"]);

  const keywords = insights.flatMap((insight) =>
    insight.toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(" ")
      .filter((w) => w.length > 4 && !stopWords.has(w))
  );

  // Remove duplicates
  const uniqueKeywords = [...new Set(keywords)];

  paragraphs.forEach((p) => {
    const text = p.innerText.toLowerCase();
    const matchCount = uniqueKeywords.filter((kw) => text.includes(kw)).length;

    // Only highlight if at least 2 keywords match (reduces false positives)
    if (matchCount >= 2) {
      p.style.background = "rgba(127, 119, 221, 0.15)";
      p.style.borderLeft = "3px solid #7f77dd";
      p.style.paddingLeft = "10px";
      p.style.borderRadius = "2px";
      p.style.transition = "background 0.3s";
      p.classList.add("ai-summarizer-highlight");
    }
  });
}
