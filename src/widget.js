// This file's default export is served verbatim as /widget.js by the Worker.
// It is NOT bundled/executed here — it's plain browser JS shipped as text,
// so it intentionally avoids backticks/template literals to keep this file's
// own outer template literal simple.

export const WIDGET_SCRIPT = `(function () {
  "use strict";

  var scriptEl = document.currentScript;
  var API_BASE = scriptEl ? new URL(scriptEl.src).origin : "";
  var STORAGE_KEY = "csl_chat_history_v1";
  var MAX_STORED_TURNS = 20;

  var css = [
    ".csl-chat-btn{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;",
    "background:#000;color:#fff;border:2px solid #fff;box-shadow:0 4px 16px rgba(0,0,0,.35);cursor:pointer;",
    "z-index:999999;display:flex;align-items:center;justify-content:center;",
    "animation:csl-pulse 1.8s ease-out 3;}",
    ".csl-chat-btn:hover{background:#222;}",
    "@keyframes csl-pulse{",
    "0%{box-shadow:0 4px 16px rgba(0,0,0,.35),0 0 0 0 rgba(0,0,0,.35);}",
    "70%{box-shadow:0 4px 16px rgba(0,0,0,.35),0 0 0 14px rgba(0,0,0,0);}",
    "100%{box-shadow:0 4px 16px rgba(0,0,0,.35),0 0 0 0 rgba(0,0,0,0);}}",
    ".csl-chat-label{position:fixed;bottom:34px;right:90px;background:#000;color:#fff;padding:8px 14px;",
    "border-radius:8px;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
    "white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.25);z-index:999999;pointer-events:none;",
    "animation:csl-label-fade 7s ease forwards;}",
    ".csl-chat-label::after{content:'';position:absolute;top:50%;right:-6px;transform:translateY(-50%);",
    "border-width:6px 0 6px 6px;border-style:solid;border-color:transparent transparent transparent #000;}",
    "@keyframes csl-label-fade{",
    "0%{opacity:0;transform:translateX(6px);}",
    "8%{opacity:1;transform:translateX(0);}",
    "80%{opacity:1;}",
    "100%{opacity:0;}}",
    ".csl-chat-panel{position:fixed;bottom:92px;right:20px;width:340px;max-width:calc(100vw - 32px);",
    "height:460px;max-height:calc(100vh - 120px);background:#fff;border-radius:12px;border:1px solid #000;",
    "box-shadow:0 8px 30px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden;",
    "z-index:999999;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}",
    ".csl-chat-panel.open{display:flex;}",
    ".csl-chat-header{background:#000;color:#fff;padding:14px 16px;font-weight:600;font-size:14px;",
    "letter-spacing:.04em;text-transform:uppercase;",
    "display:flex;justify-content:space-between;align-items:center;}",
    ".csl-chat-close{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:0 4px;}",
    ".csl-chat-messages{flex:1;overflow-y:auto;padding:12px;background:#fafafa;}",
    ".csl-chat-msg{margin-bottom:10px;max-width:85%;padding:8px 12px;border-radius:14px;",
    "font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word;}",
    ".csl-chat-msg.user{background:#000;color:#fff;margin-left:auto;border-bottom-right-radius:4px;}",
    ".csl-chat-msg.bot{background:#fff;color:#111;border:1px solid #ddd;margin-right:auto;border-bottom-left-radius:4px;}",
    ".csl-chat-msg.error{background:#fdecea;color:#611a15;margin-right:auto;}",
    ".csl-chat-msg.typing{background:#fff;border:1px solid #ddd;color:#888;margin-right:auto;}",
    ".csl-chat-inputrow{display:flex;border-top:1px solid #e2e2e2;padding:8px;gap:6px;}",
    ".csl-chat-input{flex:1;border:1px solid #ccc;border-radius:20px;padding:8px 14px;font-size:14px;",
    "outline:none;font-family:inherit;}",
    ".csl-chat-input:focus{border-color:#000;}",
    ".csl-chat-send{background:#000;color:#fff;border:none;border-radius:50%;width:36px;height:36px;",
    "cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;}",
    ".csl-chat-send:disabled{opacity:.5;cursor:default;}",
    ".csl-chat-welcome{padding:8px 12px;font-size:13px;color:#555;}"
  ].join("");

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var btn = document.createElement("button");
  btn.className = "csl-chat-btn";
  btn.setAttribute("aria-label", "Open chat");
  btn.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 ' +
    '8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 ' +
    '8.48 0 0 1 8 8v.5z"></path></svg>';

  var label = document.createElement("div");
  label.className = "csl-chat-label";
  label.textContent = "Chat with us";

  var panel = document.createElement("div");
  panel.className = "csl-chat-panel";
  panel.innerHTML =
    '<div class="csl-chat-header"><span>Canton Square Lofts</span>' +
    '<button class="csl-chat-close" aria-label="Close chat">\\u2715</button></div>' +
    '<div class="csl-chat-messages"><div class="csl-chat-welcome">' +
    "Hi! Ask me about our lofts, rates, amenities, or how to make a reservation." +
    "</div></div>" +
    '<div class="csl-chat-inputrow">' +
    '<input class="csl-chat-input" type="text" placeholder="Type a message..." maxlength="1000" />' +
    '<button class="csl-chat-send" aria-label="Send">\\u27A4</button>' +
    "</div>";

  document.body.appendChild(label);
  document.body.appendChild(btn);
  document.body.appendChild(panel);

  setTimeout(function () {
    if (label.parentNode) label.parentNode.removeChild(label);
  }, 7200);

  var messagesEl = panel.querySelector(".csl-chat-messages");
  var inputEl = panel.querySelector(".csl-chat-input");
  var sendBtn = panel.querySelector(".csl-chat-send");
  var closeBtn = panel.querySelector(".csl-chat-close");

  var history = loadHistory();
  history.forEach(function (turn) {
    renderMessage(turn.role === "user" ? "user" : "bot", turn.content);
  });

  function loadHistory() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED_TURNS)));
    } catch (e) {
      /* storage unavailable, ignore */
    }
  }

  function renderMessage(kind, text) {
    var msg = document.createElement("div");
    msg.className = "csl-chat-msg " + kind;
    msg.textContent = text;
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return msg;
  }

  function setOpen(open) {
    panel.classList.toggle("open", open);
    if (open) {
      inputEl.focus();
    }
  }

  btn.addEventListener("click", function () {
    if (label.parentNode) label.parentNode.removeChild(label);
    setOpen(!panel.classList.contains("open"));
  });
  closeBtn.addEventListener("click", function () {
    setOpen(false);
  });

  function sendMessage() {
    var text = inputEl.value.trim();
    if (!text) return;

    renderMessage("user", text);
    history.push({ role: "user", content: text });
    saveHistory();
    inputEl.value = "";
    inputEl.disabled = true;
    sendBtn.disabled = true;

    var typingMsg = renderMessage("typing", "...");

    fetch(API_BASE + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        typingMsg.remove();
        if (result.ok && result.data.reply) {
          renderMessage("bot", result.data.reply);
          history.push({ role: "assistant", content: result.data.reply });
          saveHistory();
        } else {
          renderMessage("error", (result.data && result.data.error) || "Something went wrong. Please try again.");
        }
      })
      .catch(function () {
        typingMsg.remove();
        renderMessage("error", "Couldn't connect. Please check your connection and try again.");
      })
      .finally(function () {
        inputEl.disabled = false;
        sendBtn.disabled = false;
        inputEl.focus();
      });
  }

  sendBtn.addEventListener("click", sendMessage);
  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });
})();
`;
