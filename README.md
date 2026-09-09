# Canton Square Lofts Chatbot

A small FAQ chatbot for [cantonsquarelofts.com](https://www.cantonsquarelofts.com/), built to embed into Squarespace via Code Injection.

- **Backend**: a Cloudflare Worker (`src/worker.js`) that calls the Anthropic Claude API and keeps your API key secret. It also serves the widget script itself at `/widget.js`.
- **Widget**: a vanilla JS chat bubble (`src/widget.js`) with no build step or dependencies — safe to drop into Squarespace.
- **Knowledge base**: `src/faq.js` — plain text describing the property. Edit this with real details; the bot only answers from what's here and says "I don't know, contact the office" for anything else.

## 1. Fill in your property details

Edit `src/faq.js` and replace the placeholder sections (unit types, amenities, pet policy, leasing process, office hours/contact, tours, parking, utilities) with accurate current information. The more complete this is, the better the bot's answers.

## 2. Get an Anthropic API key

Create one at [console.anthropic.com](https://console.anthropic.com/) under **API Keys**. This project uses Claude Haiku by default (`claude-haiku-4-5-20251001`, set in `wrangler.toml`), which is inexpensive for short FAQ-style replies.

## 3. Deploy the Worker (Cloudflare)

You'll need a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

```bash
npm install
npx wrangler login          # opens a browser to authorize
npx wrangler secret put ANTHROPIC_API_KEY   # paste your key when prompted
npm run deploy
```

Wrangler will print your Worker's URL, e.g. `https://canton-square-lofts-chatbot.<your-subdomain>.workers.dev`. That's your chatbot's backend — keep it handy for the next step.

`wrangler.toml` already restricts which sites may call the chat endpoint via `ALLOWED_ORIGIN` (set to your `www` and apex domains). Update it if your domain differs, then redeploy.

### Local testing (optional)

```bash
cp .dev.vars.example .dev.vars   # fill in your real key, this file is gitignored
npm run dev
```

This runs the Worker locally so you can test `/api/chat` before deploying.

## 4. Embed the widget on Squarespace

In Squarespace: **Settings → Advanced → Code Injection → Footer**, add:

```html
<script src="https://canton-square-lofts-chatbot.<your-subdomain>.workers.dev/widget.js" async></script>
```

(Replace the URL with the one Wrangler printed for you.) Save. The chat bubble will appear in the bottom-right corner on every page. No other Squarespace configuration is needed — the widget figures out its own backend URL from the script tag.

> Squarespace Code Injection requires a Business plan or higher.

## How it works

- The widget posts each message plus recent conversation history to `POST /api/chat` on the Worker.
- The Worker sends it to Claude along with a system prompt built from `src/faq.js`, instructing it to stay on-topic and admit when it doesn't know something.
- Conversation history is kept client-side in `sessionStorage` (cleared when the browser tab closes) — nothing is stored server-side.
- CORS on `/api/chat` only allows requests from the origins listed in `ALLOWED_ORIGIN`.

## Customizing

- **Colors/branding**: edit the CSS in `src/widget.js` (`.csl-chat-btn`, `.csl-chat-panel`, etc. — currently a dark green matching a typical property brand; change the hex codes).
- **Model**: change `MODEL` in `wrangler.toml` (e.g. to a Sonnet model for more nuanced answers, at higher cost per message).
- **Welcome message**: edit the `csl-chat-welcome` text in `src/widget.js`.
