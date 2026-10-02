const $ = (id) => document.getElementById(id);
let summaryData = null;
let briefMode = false;

function show(id) {
  ["state-empty", "state-loading", "state-error", "state-output"].forEach((s) =>
    $(s).classList.add("hidden"),
  );
  $(id).classList.remove("hidden");
}

function renderSummary(data, cached = false) {
  summaryData = data;

  const list = $("bullets");
  list.innerHTML = "";
  (data.bullets || []).forEach((b) => {
    const li = document.createElement("li");
    li.textContent = b;
    list.appendChild(li);
  });

  const insights = $("insights");
  insights.innerHTML = "";
  (data.insights || []).forEach((i) => {
    const chip = document.createElement("div");
    chip.className = "insight-chip";
    chip.textContent = i;
    insights.appendChild(chip);
  });

  $("reading-time-text").textContent = data.readingTime || "—";

  const wordCount =
    data.wordCount ||
    Math.round(
      summaryData.bullets?.join(" ").split(" ").length +
        summaryData.insights?.join(" ").split(" ").length,
    );
  $("word-count-text").textContent = wordCount + " words";
  $("cached-tag").classList.toggle("hidden", !cached);
  show("state-output");

  if (data.insights?.length) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.tabs.sendMessage(tab.id, {
        action: "highlight",
        insights: data.insights,
      });
    });
  }
}

function showError(msg) {
  $("error-text").textContent = msg || "Something went wrong.";
  show("state-error");
}

async function summarize() {
  show("state-loading");
  $("cached-tag").classList.add("hidden");
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    let pageData;
    try {
      pageData = await chrome.tabs.sendMessage(tab.id, { action: "extract" });
    } catch {
      showError(
        "This page can't be summarized. Try it on a news article or blog post.",
      );
      return;
    }

    if (!pageData?.content) {
      showError("No readable content found on this page.");
      return;
    }

    const result = await chrome.runtime.sendMessage({
      action: "summarize",
      data: { ...pageData, briefMode },
    });
    if (result?.error) showError(result.error);
    else if (result?.summary) renderSummary(result.summary, result.cached);
    else showError("No summary returned. Please try again.");
  } catch (err) {
    showError(err.message || "Unexpected error.");
  }
}

$("summarize-btn").addEventListener("click", summarize);
$("retry-btn").addEventListener("click", summarize);

$("clear-btn").addEventListener("click", () => {
  summaryData = null;
  $("cached-tag").classList.add("hidden");
  show("state-empty");
});

$("brief-btn").addEventListener("click", () => {
  briefMode = true;
  summarize();
});

$("summarize-btn").addEventListener("click", () => {
  briefMode = false;
  summarize();
});

$("copy-btn").addEventListener("click", async () => {
  if (!summaryData) return;
  const text = [
    (summaryData.bullets || []).map((b) => `• ${b}`).join("\n"),
    "",
    (summaryData.insights || []).map((i) => `- ${i}`).join("\n"),
    "",
    summaryData.readingTime,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
  try {
    await navigator.clipboard.writeText(text);
    $("copy-label").textContent = "Copied!";
    setTimeout(() => {
      $("copy-label").textContent = "Copy";
    }, 2000);
  } catch {
    $("copy-label").textContent = "Failed";
    setTimeout(() => {
      $("copy-label").textContent = "Copy";
    }, 2000);
  }
});

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    $("page-title").textContent = tab.title || "Untitled page";
    try {
      const u = new URL(tab.url);
      $("page-url").textContent = u.hostname + u.pathname.slice(0, 30);
    } catch {
      $("page-url").textContent = "";
    }

    const cached = await chrome.storage.local.get(tab.url);
    if (cached[tab.url]) {
      renderSummary(cached[tab.url], true);
      return;
    }
  }
  show("state-empty");
}

init();
