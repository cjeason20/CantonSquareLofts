# Canton Square Lofts Chatbot

A chatbot for [cantonsquarelofts.com](https://www.cantonsquarelofts.com/) — four short-term rental lofts plus the Lounge 1900 event space on the Canton, MS square — built to embed into Squarespace via Code Injection. It answers FAQs and can collect booking requests to email to the property.

- **Backend**: a Cloudflare Worker (`src/worker.js`) that calls the Anthropic Claude API and keeps your API key secret. It also serves the widget script itself at `/widget.js`.
- **Widget**: a vanilla JS chat bubble (`src/widget.js`) with no build step or dependencies — safe to drop into Squarespace.
- **Knowledge base**: `src/faq.js` — property info, rates, and exact Q&A pairs sourced from the property's rental doc. Edit this whenever rates or policies change.
- **Booking requests**: when a visitor wants to book a loft or Lounge 1900, the bot collects name, phone, email, check-in/check-out dates, rental type, and guest count, then emails a summary to your team via [Resend](https://resend.com).

## 1. Keep property details current

Edit `src/faq.js` if rates, policies, or amenities change. The bot only answers from what's in this file (plus the exact Q&A pairs listed there) and tells visitors to email `info@cantonsquarelofts.com` for anything it doesn't know.

## 2. Get an Anthropic API key

Create one at [console.anthropic.com](https://console.anthropic.com/) under **API Keys**. This project uses Claude Haiku by default (`claude-haiku-4-5-20251001`, set in `wrangler.toml`), which is inexpensive for short FAQ-style replies.

## 3. Get a Resend API key (for booking-request emails)

1. Sign up free at [resend.com](https://resend.com).
2. To send from a `@cantonsquarelofts.com` address, verify your domain under **Domains** — Resend gives you DNS records (TXT/CNAME) to add wherever your domain's DNS is managed (check with whoever manages `cantonsquarelofts.com`'s DNS — Squarespace Domains, or another registrar). Until you do this, the default `onboarding@resend.dev` sender only delivers to the email address on your Resend account, not to `info@cantonsquarelofts.com` — fine for testing, not for production.
3. Create an API key under **API Keys**.
4. Once your domain is verified, update `FROM_EMAIL` in `wrangler.toml` to something like `"Canton Square Lofts <bookings@cantonsquarelofts.com>"`.

## 4. Deploy the Worker (Cloudflare)

You'll need a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

```bash
npm install
npx wrangler login                          # opens a browser to authorize
npx wrangler secret put ANTHROPIC_API_KEY   # paste your Anthropic key when prompted
npx wrangler secret put RESEND_API_KEY      # paste your Resend key when prompted
npm run deploy
```

Wrangler will print your Worker's URL, e.g. `https://canton-square-lofts-chatbot.<your-subdomain>.workers.dev`. That's your chatbot's backend — keep it handy for the next step.

`wrangler.toml` already restricts which sites may call the chat endpoint via `ALLOWED_ORIGIN` (set to your `www` and apex domains) and sets `TO_EMAIL`/`FROM_EMAIL` for booking notifications. Update as needed, then redeploy.

### Local testing (optional)

```bash
cp .dev.vars.example .dev.vars   # fill in your real keys, this file is gitignored
npm run dev
```

This runs the Worker locally so you can test `/api/chat` before deploying.

## 5. Embed the widget on Squarespace

In Squarespace: **Settings → Advanced → Code Injection → Footer**, add:

```html
<script src="https://canton-square-lofts-chatbot.<your-subdomain>.workers.dev/widget.js" async></script>
```

(Replace the URL with the one Wrangler printed for you.) Save. The chat bubble will appear in the bottom-right corner on every page. No other Squarespace configuration is needed — the widget figures out its own backend URL from the script tag.

> Squarespace Code Injection requires a Business plan or higher.

## How it works

- The widget posts each message plus recent conversation history to `POST /api/chat` on the Worker.
- The Worker sends it to Claude along with a system prompt built from `src/faq.js`, instructing it to stay on-topic, use the exact wording for known Q&A, and admit when it doesn't know something.
- When Claude has collected all the fields for a booking request, it calls a `submit_rental_request` tool; the Worker sends that as an email via Resend to `TO_EMAIL`, then lets Claude confirm to the visitor that the request was sent. Staff still need to follow up to confirm actual availability — the bot never promises a confirmed booking.
- Conversation history is kept client-side in `sessionStorage` (cleared when the browser tab closes) — nothing is stored server-side beyond the outbound email itself.
- CORS on `/api/chat` only allows requests from the origins listed in `ALLOWED_ORIGIN`.

## Customizing

- **Colors/branding**: edit the CSS in `src/widget.js` (`.csl-chat-btn`, `.csl-chat-panel`, etc. — currently a dark green; change the hex codes).
- **Model**: change `MODEL` in `wrangler.toml` (e.g. to a Sonnet model for more nuanced answers, at higher cost per message).
- **Welcome message**: edit the `csl-chat-welcome` text in `src/widget.js`.
- **Booking notification recipient**: change `TO_EMAIL` in `wrangler.toml`.
