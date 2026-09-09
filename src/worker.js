import { SYSTEM_PROMPT } from "./faq.js";
import { WIDGET_SCRIPT } from "./widget.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_TURNS = 8; // user+assistant pairs kept for context
const MAX_OUTPUT_TOKENS = 500;

function corsHeaders(env, request) {
  const allowedOrigins = (env.ALLOWED_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0] || "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const turns = history
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0 &&
        m.content.length <= MAX_MESSAGE_LENGTH
    )
    .slice(-MAX_HISTORY_TURNS * 2);
  return turns.map((m) => ({ role: m.role, content: m.content }));
}

async function handleChat(request, env) {
  const headers = corsHeaders(env, request);

  if (!env.ANTHROPIC_API_KEY) {
    return jsonResponse({ error: "Chatbot is not configured yet." }, 503, headers);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400, headers);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return jsonResponse({ error: "Message is required." }, 400, headers);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(
      { error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` },
      400,
      headers
    );
  }

  const messages = [...sanitizeHistory(body.history), { role: "user", content: message }];

  let anthropicRes;
  try {
    anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: env.MODEL || DEFAULT_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });
  } catch {
    return jsonResponse({ error: "Couldn't reach the chatbot service. Please try again." }, 502, headers);
  }

  if (!anthropicRes.ok) {
    return jsonResponse(
      { error: "The chatbot service returned an error. Please try again shortly." },
      502,
      headers
    );
  }

  const data = await anthropicRes.json();
  const reply = data.content?.find((block) => block.type === "text")?.text?.trim();

  if (!reply) {
    return jsonResponse({ error: "No response generated. Please try again." }, 502, headers);
  }

  return jsonResponse({ reply }, 200, headers);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/widget.js" && request.method === "GET") {
      return new Response(WIDGET_SCRIPT, {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    if (url.pathname === "/api/chat") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(env, request) });
      }
      if (request.method === "POST") {
        return handleChat(request, env);
      }
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("Canton Square Lofts chatbot is running.", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  },
};
