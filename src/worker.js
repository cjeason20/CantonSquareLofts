import { SYSTEM_PROMPT } from "./faq.js";
import { WIDGET_SCRIPT } from "./widget.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_FROM_EMAIL = "Canton Square Lofts Chatbot <onboarding@resend.dev>";
const DEFAULT_TO_EMAIL = "info@cantonsquarelofts.com";
const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_TURNS = 8; // user+assistant pairs kept for context
const MAX_OUTPUT_TOKENS = 500;
const MAX_FIELD_LENGTH = 300;

const TOOLS = [
  {
    name: "submit_rental_request",
    description:
      "Submit a completed booking/rental request from the guest to the Canton Square Lofts team for follow-up. Only call this once you have collected all required fields from the guest.",
    input_schema: {
      type: "object",
      properties: {
        full_name: { type: "string", description: "Guest's full name" },
        phone: { type: "string", description: "Guest's phone number" },
        email: { type: "string", description: "Guest's email address" },
        check_in_date: { type: "string", description: "Requested check-in date, as stated by the guest" },
        check_out_date: { type: "string", description: "Requested check-out date, as stated by the guest" },
        rental_type: {
          type: "string",
          description:
            "Which loft (e.g. 'Mississippi Blues Loft'), 'Lounge 1900 event space', or 'not sure yet'",
        },
        num_guests: { type: "string", description: "Number of guests" },
        notes: { type: "string", description: "Any other relevant details the guest mentioned" },
      },
      required: ["full_name", "phone", "email", "check_in_date", "check_out_date", "rental_type", "num_guests"],
    },
  },
];

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

function field(value) {
  if (typeof value !== "string" || !value.trim()) return "Not provided";
  return value.trim().slice(0, MAX_FIELD_LENGTH);
}

async function sendRentalRequestEmail(env, input) {
  if (!env.RESEND_API_KEY) {
    return { ok: false, error: "Email delivery isn't configured yet — please contact the property directly." };
  }

  const data = {
    full_name: field(input.full_name),
    phone: field(input.phone),
    email: field(input.email),
    check_in_date: field(input.check_in_date),
    check_out_date: field(input.check_out_date),
    rental_type: field(input.rental_type),
    num_guests: field(input.num_guests),
    notes: field(input.notes),
  };

  const text = [
    `New booking request from the website chatbot:`,
    ``,
    `Name: ${data.full_name}`,
    `Phone: ${data.phone}`,
    `Email: ${data.email}`,
    `Check-in: ${data.check_in_date}`,
    `Check-out: ${data.check_out_date}`,
    `Rental type: ${data.rental_type}`,
    `Guests: ${data.num_guests}`,
    `Notes: ${data.notes}`,
  ].join("\n");

  let res;
  try {
    res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL || DEFAULT_FROM_EMAIL,
        to: [env.TO_EMAIL || DEFAULT_TO_EMAIL],
        subject: `New rental request: ${data.full_name} (${data.rental_type})`,
        text,
      }),
    });
  } catch {
    return { ok: false, error: "Couldn't reach the email service." };
  }

  if (!res.ok) {
    return { ok: false, error: `Email service returned an error (status ${res.status}).` };
  }

  return { ok: true };
}

// Best-effort SMS notification via an email-to-SMS carrier gateway (e.g.
// "6015551234@cspire1.com" in TO_SMS_EMAIL, set as a Worker secret — never
// commit a real phone number to this repo). Deliberately just an alert,
// not the full booking details — check email for those.
async function sendBookingSmsAlert(env) {
  if (!env.TO_SMS_EMAIL || !env.RESEND_API_KEY) {
    console.log("sendBookingSmsAlert: skipped, TO_SMS_EMAIL or RESEND_API_KEY not set");
    return;
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL || DEFAULT_FROM_EMAIL,
        to: [env.TO_SMS_EMAIL],
        subject: "",
        text: "Canton Square Lofts: new booking inquiry submitted on the website. Check email for details.",
      }),
    });
    const body = await res.text();
    console.log(`sendBookingSmsAlert: Resend responded ${res.status}: ${body}`);
  } catch (err) {
    console.error("sendBookingSmsAlert: fetch threw", err);
  }
}

async function callAnthropic(env, messages) {
  return fetch(ANTHROPIC_API_URL, {
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
      tools: TOOLS,
      messages,
    }),
  });
}

async function handleChat(request, env, ctx) {
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
    anthropicRes = await callAnthropic(env, messages);
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

  let data = await anthropicRes.json();

  // If Claude wants to submit a rental request, execute it and let Claude
  // produce the final visitor-facing confirmation in a follow-up turn.
  if (data.stop_reason === "tool_use") {
    const toolUse = data.content?.find((block) => block.type === "tool_use");

    if (toolUse && toolUse.name === "submit_rental_request") {
      const result = await sendRentalRequestEmail(env, toolUse.input || {});
      console.log(`Booking email result: ok=${result.ok}${result.error ? ` error=${result.error}` : ""}`);
      if (result.ok) {
        ctx.waitUntil(sendBookingSmsAlert(env));
      }

      messages.push({ role: "assistant", content: data.content });
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result.ok
              ? "Request sent to the Canton Square Lofts team."
              : `Failed to send: ${result.error}`,
            is_error: !result.ok,
          },
        ],
      });

      try {
        anthropicRes = await callAnthropic(env, messages);
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

      data = await anthropicRes.json();
    }
  }

  const reply = data.content?.find((block) => block.type === "text")?.text?.trim();

  if (!reply) {
    return jsonResponse({ error: "No response generated. Please try again." }, 502, headers);
  }

  return jsonResponse({ reply }, 200, headers);
}

export default {
  async fetch(request, env, ctx) {
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
        return handleChat(request, env, ctx);
      }
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("Canton Square Lofts chatbot is running.", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  },
};
