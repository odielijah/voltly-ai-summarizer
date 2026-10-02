# ⚡️ Voltly Summarizer - AI Chrome Extension

A Chrome Extension (Manifest V3) that extracts content from any webpage and returns a structured AI summary using Google Gemini. Built with a secure Vercel proxy so the API key is never exposed in the extension.

**Repository:** https://github.com/odielijah/voltly-ai-summarizer

---

## What it does

Click the extension icon on any article or blog post and get:

- **Bullet-point summary** — 4 to 5 key points from the page
- **Key insights** — 2 to 3 deeper takeaways
- **Estimated reading time** — based on word count
- **In-page highlights** — matching paragraphs on the page are highlighted in purple after summarizing
- **Caching** — revisiting a page loads the summary instantly without calling the API again

Supports dark mode automatically.

---

## Installing the extension (local)

This extension is not on the Chrome Web Store. Follow these steps to install it locally:

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer Mode** using the toggle in the top right
4. Click **Load unpacked**
5. Select the `ai-summarizer/` folder
6. The Page Summarizer icon will appear in your Chrome toolbar

---

## Setting up the proxy server

The extension does not call Gemini directly. All API requests go through a Vercel serverless function that holds the API key securely in environment variables.

### 1. Get a Gemini API key

Go to [aistudio.google.com](https://aistudio.google.com), sign in with your Google account, and click **Get API key → Create API key**. Copy the key.

### 2. Deploy the proxy to Vercel

```bash
cd ai-summarizer-proxy
npm install
npx vercel
```

Follow the prompts, pressing Enter for all defaults. Once deployed, go to your **Vercel dashboard → ai-summarizer-proxy → Settings → Environment Variables** and add:

| Key              | Value                          |
| ---------------- | ------------------------------ |
| `GEMINI_API_KEY` | your key from Google AI Studio |

Then redeploy:

```bash
npx vercel --prod
```

### 3. Connect the extension to your proxy

Open `ai-summarizer/background.js` and update this line with your Vercel URL:

```js
const PROXY_URL = "https://ai-summarizer-proxy.vercel.app/api/summarize";
```

Reload the extension in `chrome://extensions` by clicking the refresh icon.

---

## File structure

```
ai-summarizer/                   ← load this folder into Chrome
├── manifest.json
├── background.js
├── content.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png

ai-summarizer-proxy/             ← deployed to Vercel
├── api/
│   └── summarize.js
├── .env                         ← never committed
├── .gitignore
└── package.json
```

---

## Architecture

This project uses a two-tier architecture to keep the Gemini API key secure.

### Chrome Extension

**manifest.json** declares the extension's permissions (`activeTab`, `storage`, `scripting`), registers the background service worker, and injects `content.js` into every webpage.

**content.js** runs silently inside every webpage. When the popup requests content, it extracts readable text using heuristic filtering — it prefers `<article>` or `<main>` tags, strips navigation, sidebars, ads, and footers, and falls back to the `<div>` with the highest paragraph density. Output is capped at 15,000 characters. It also handles in-page highlighting by scanning paragraphs for phrases that match the AI's insights and applying a purple highlight style.

**background.js** is the service worker. It receives a message from the popup, checks `chrome.storage.local` for a cached summary first, and if none exists, sends the page text to the Vercel proxy. It saves the result to cache before returning it to the popup.

**popup.js** manages the UI state machine: empty → loading → output (or error). It renders bullets, insights, reading time, handles the copy button, triggers in-page highlights, and reads from cache on init so repeat visits are instant.

### Vercel Proxy

A single serverless function at `/api/summarize`. It receives page text from the extension, adds the Gemini API key from Vercel environment variables, and calls the Gemini API. It tries `gemini-2.5-flash` first, falling back to `gemini-1.5-flash` and then `gemini-pro` if a model is unavailable. It returns structured JSON with `bullets`, `insights`, and `readingTime`.

### Data flow

```
User clicks "Summarize"
  → popup.js sends message to content.js: "extract"
  → content.js returns cleaned page text
  → popup.js sends text to background.js: "summarize"
  → background.js checks chrome.storage.local
    → cached: returns immediately, no API call
    → not cached: POSTs text to Vercel proxy
      → proxy adds Gemini key from env vars
      → proxy calls Gemini API
      → Gemini returns structured JSON
      → proxy returns JSON to background.js
      → background.js caches result by URL
  → popup.js renders bullets + insights + reading time
  → popup.js sends insights to content.js: "highlight"
  → content.js highlights matching paragraphs on the page
```

---

## AI integration

The extension uses **Google Gemini** via the `@google/generative-ai` SDK on the proxy server.

The prompt instructs Gemini to return a raw JSON object with three fields:

- `bullets` — 4 to 5 concise key points from the content
- `insights` — 2 to 3 deeper takeaways or implications
- `readingTime` — estimated reading time based on word count at 200 words per minute

The proxy strips any accidental markdown formatting from the response before parsing and returning it.

**Model fallback chain:** `gemini-2.5-flash` → `gemini-1.5-flash` → `gemini-pro`

---

## Security decisions

**API key in environment variables only.** The Gemini API key is stored exclusively in Vercel's environment variable system. It is never written into any source file and never committed to the repository.

**Proxy as the only caller.** The Chrome Extension never communicates with Google's API directly. It only ever calls the Vercel proxy URL. Even if someone inspects the extension's source code, there is no secret to find.

**Minimal permissions.** The extension only requests `activeTab`, `storage`, and `scripting`. No broad host permissions beyond what is needed.

**XSS prevention.** All summary content is rendered using `element.textContent`, never `innerHTML`. Highlight styles are applied via the DOM style API, not by injecting HTML strings.

**Content Security Policy.** The `manifest.json` sets a strict CSP that blocks inline scripts and only allows resources from the extension's own files.

---

## Trade-offs

**Proxy adds latency.** Every summarization request goes through Vercel before reaching Gemini, adding roughly 100–300ms compared to calling Gemini directly. This is an acceptable trade-off for keeping the API key secure.

**No proxy authentication.** Anyone who knows the proxy URL can send requests to it and consume API quota. A production version would add request signing or an origin check. For this project, the security model is appropriate.

**15,000 character cap.** Very long pages are truncated before being sent to Gemini to keep costs low and avoid token limit errors. The summary may miss content near the end of very long articles.

**Cache never expires.** Summaries are cached indefinitely in `chrome.storage.local`. A production version would add a TTL so summaries refresh for pages that update frequently.

**Highlight matching is heuristic.** The highlight feature matches the first six words of each insight against paragraph text. It works well on most articles but may miss matches on pages with unusual formatting or very short paragraphs.
