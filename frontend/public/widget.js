/*! BotNira embeddable widget — v1.0
 * Usage:
 *   <script src="https://YOUR-BOTNIRA.com/widget.js" data-botnira-vendor="VENDOR_ID"></script>
 * The script element's `src` decides which BotNira backend to talk to (same origin).
 */
(function () {
  "use strict";
  if (window.__botniraWidgetLoaded) return;
  window.__botniraWidgetLoaded = true;

  // --- Resolve config from the <script> tag -------------------------------
  var scriptEl =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName("script");
      for (var i = all.length - 1; i >= 0; i--) {
        if (all[i].src && all[i].src.indexOf("/widget.js") !== -1) return all[i];
      }
      return null;
    })();

  if (!scriptEl) {
    console.error("[BotNira] widget.js could not locate its own script tag.");
    return;
  }
  var vendorId = scriptEl.getAttribute("data-botnira-vendor");
  if (!vendorId) {
    console.error("[BotNira] Missing data-botnira-vendor on the <script> tag.");
    return;
  }
  var scriptUrl = new URL(scriptEl.src, window.location.href);
  var API_BASE = scriptUrl.origin + "/api";

  // storage key is scoped per vendor so two BotNira widgets on the same site never mix up
  var STORAGE_KEY = "botnira_conv_" + vendorId;

  // --- Fetch the per-vendor bot info --------------------------------------
  var botInfo = { vendor_name: "", bot_name: "BotNira", greeting: "Hi! I'm here — talk with me." };
  var botInfoLoaded = false;
  var botInfoError = null;
  function loadBotInfo(cb) {
    fetch(API_BASE + "/public/bot/" + encodeURIComponent(vendorId), {
      method: "GET", mode: "cors", credentials: "omit"
    })
      .then(function (r) {
        if (!r.ok) throw new Error("vendor-info HTTP " + r.status);
        return r.json();
      })
      .then(function (d) {
        botInfo = Object.assign(botInfo, d);
        botInfoLoaded = true;
        cb && cb(null);
      })
      .catch(function (e) {
        botInfoError = e && e.message ? e.message : String(e);
        console.error("[BotNira] cannot load bot info:", botInfoError,
          "— check your site's CSP / firewall is not blocking", scriptUrl.origin);
        cb && cb(botInfoError);
      });
  }

  // --- DOM / styles -------------------------------------------------------
  var host = document.createElement("div");
  host.id = "botnira-widget-root";
  host.style.cssText = "position:fixed;z-index:2147483647;bottom:0;right:0;";
  document.body.appendChild(host);
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  var css = [
    ":host,*,*:before,*:after{box-sizing:border-box}",
    ".bn-wrap{position:fixed;right:20px;bottom:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0b;z-index:2147483647}",
    ".bn-fab{width:60px;height:60px;border-radius:50%;background:#002FA7;color:#fff;border:2px solid #0a0a0b;box-shadow:4px 4px 0 0 #0a0a0b;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .2s ease-out,box-shadow .2s ease-out}",
    ".bn-fab:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 0 #0a0a0b}",
    ".bn-fab svg{width:26px;height:26px;stroke:#fff;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}",
    ".bn-fab .bn-dot{position:absolute;top:-4px;right:-4px;width:14px;height:14px;border-radius:50%;background:#10b981;border:2px solid #0a0a0b;animation:bn-ping 2s ease-in-out infinite}",
    "@keyframes bn-ping{0%,100%{transform:scale(1)}50%{transform:scale(1.35)}}",
    ".bn-teaser{position:fixed;right:96px;bottom:28px;background:#fff;color:#0a0a0b;border:2px solid #0a0a0b;padding:12px 34px 12px 16px;width:260px;box-shadow:4px 4px 0 0 #0a0a0b;font-size:13px;line-height:1.4;font-weight:500;animation:bn-slide .4s ease-out both;cursor:pointer;transition:transform .15s,box-shadow .15s;z-index:2147483647}",
    ".bn-teaser:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 0 #0a0a0b}",
    ".bn-teaser:before{content:'';position:absolute;right:-9px;bottom:18px;width:14px;height:14px;background:#fff;border-right:2px solid #0a0a0b;border-bottom:2px solid #0a0a0b;transform:rotate(-45deg)}",
    ".bn-teaser strong{display:block;font-weight:800;margin-bottom:2px}",
    ".bn-teaser-x{position:absolute;top:4px;right:6px;background:transparent;border:0;font-size:16px;line-height:1;color:#0a0a0b;cursor:pointer;opacity:.6}",
    ".bn-teaser-x:hover{opacity:1}",
    "@keyframes bn-slide{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}",
    ".bn-panel{position:absolute;right:0;bottom:80px;width:380px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 120px);background:#fff;border:2px solid #0a0a0b;box-shadow:8px 8px 0 0 #0a0a0b;display:flex;flex-direction:column;overflow:hidden;transform-origin:bottom right}",
    ".bn-head{background:#002FA7;color:#fff;padding:14px 16px;border-bottom:2px solid #0a0a0b;display:flex;justify-content:space-between;align-items:center}",
    ".bn-head h4{margin:0;font-size:15px;font-weight:800;letter-spacing:-.01em}",
    ".bn-head small{display:block;font-size:11px;opacity:.8;margin-top:2px;font-weight:500}",
    ".bn-close{background:transparent;border:none;color:#fff;cursor:pointer;font-size:20px;line-height:1}",
    ".bn-msgs{flex:1;min-height:0;overflow-y:auto;padding:14px;background:#f9fafb;display:flex;flex-direction:column;gap:10px}",
    ".bn-bubble{max-width:85%;padding:9px 12px;border:2px solid #0a0a0b;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}",
    ".bn-bubble a{color:inherit;font-weight:700;text-decoration:underline;word-break:break-all}",
    ".bn-bubble .bn-label{display:block;font-size:10px;font-weight:700;letter-spacing:.12em;opacity:.7;margin-bottom:3px;text-transform:uppercase}",
    ".bn-user{align-self:flex-end;background:#0a0a0b;color:#fff}",
    ".bn-user a{color:#6f8cff}",
    ".bn-bot{align-self:flex-start;background:#fff}",
    ".bn-typing{align-self:flex-start;font-size:12px;color:#4b5563;font-style:italic}",
    ".bn-inputbar{display:flex;gap:6px;padding:10px;border-top:2px solid #0a0a0b;background:#fff}",
    ".bn-inputbar textarea{flex:1;resize:none;border:2px solid #0a0a0b;padding:8px 10px;font:inherit;font-size:14px;min-height:38px;max-height:100px;outline:none}",
    ".bn-inputbar textarea:focus{box-shadow:0 0 0 2px #002FA7}",
    ".bn-send{background:#002FA7;color:#fff;border:2px solid #0a0a0b;font-weight:700;padding:0 14px;cursor:pointer;box-shadow:3px 3px 0 0 #0a0a0b;transition:transform .15s,box-shadow .15s}",
    ".bn-send:hover{transform:translate(-1px,-1px);box-shadow:4px 4px 0 0 #0a0a0b}",
    ".bn-send:disabled{opacity:.5;cursor:not-allowed;box-shadow:none;transform:none}",
    ".bn-foot{text-align:center;padding:6px;font-size:10px;color:#6b7280;letter-spacing:.1em;border-top:1px solid #e5e7eb;background:#fff}",
    ".bn-foot a{color:#002FA7;font-weight:700;text-decoration:none}",
    "@media (max-width:480px){.bn-panel{right:10px;width:calc(100vw - 20px);bottom:78px}.bn-wrap{right:10px;bottom:10px}}"
  ].join("\n");
  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  root.appendChild(styleEl);

  // --- Markup -------------------------------------------------------------
  var wrap = document.createElement("div");
  wrap.className = "bn-wrap";
  wrap.innerHTML =
    '<div class="bn-panel" style="display:none" id="bnPanel">' +
    '  <div class="bn-head">' +
    '    <div><h4 id="bnName">BotNira</h4><small id="bnSub">Online</small></div>' +
    '    <button class="bn-close" id="bnClose" aria-label="Close">×</button>' +
    "  </div>" +
    '  <div class="bn-msgs" id="bnMsgs"></div>' +
    '  <div class="bn-inputbar">' +
    '    <textarea id="bnInput" rows="1" placeholder="Type a message…"></textarea>' +
    '    <button class="bn-send" id="bnSend">Send</button>' +
    "  </div>" +
    '  <div class="bn-foot">POWERED BY <a href="https://botnira.com" target="_blank" rel="noopener">BotNira</a></div>' +
    "</div>" +
    '<button class="bn-fab" id="bnFab" aria-label="Open chat">' +
    '  <span class="bn-dot" id="bnDot" style="display:none"></span>' +
    '  <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
    "</button>";
  root.appendChild(wrap);

  var $ = function (id) { return root.getElementById ? root.getElementById(id) : document.getElementById(id); };
  // shadowRoot doesn't have getElementById in all browsers; use querySelector fallback
  var q = function (sel) { return root.querySelector ? root.querySelector(sel) : document.querySelector(sel); };

  var panel = q("#bnPanel");
  var fab = q("#bnFab");
  var dotEl = q("#bnDot");
  var closeBtn = q("#bnClose");
  var msgsEl = q("#bnMsgs");
  var input = q("#bnInput");
  var sendBtn = q("#bnSend");
  var nameEl = q("#bnName");
  var subEl = q("#bnSub");
  var teaserEl = null;

  // Has this visitor dismissed or opened chat before?
  var DISMISSED_KEY = STORAGE_KEY + "_teaser_dismissed";
  function teaserDismissed() {
    try { return localStorage.getItem(DISMISSED_KEY) === "1"; } catch (e) { return false; }
  }
  function rememberDismissed() {
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch (e) {}
  }

  function showTeaser() {
    if (teaserEl || panel.style.display === "flex") return;
    if (teaserDismissed()) { dotEl.style.display = "block"; return; }
    var t = document.createElement("div");
    t.className = "bn-teaser";
    t.setAttribute("role", "button");
    var greeting = (botInfo.greeting && botInfo.greeting.length < 120)
      ? botInfo.greeting
      : "Hi! I'm here — ask me anything.";
    t.innerHTML =
      '<button class="bn-teaser-x" aria-label="Dismiss">×</button>' +
      "<strong>" + escapeHtml(botInfo.bot_name || "BotNira") + "</strong>" +
      escapeHtml(greeting);
    t.addEventListener("click", function (e) {
      if (e.target.classList.contains("bn-teaser-x")) {
        e.stopPropagation();
        removeTeaser();
        rememberDismissed();
        dotEl.style.display = "block";
        return;
      }
      open();
    });
    teaserEl = t;
    wrap.appendChild(t);
    dotEl.style.display = "block";
  }
  function removeTeaser() {
    if (teaserEl && teaserEl.parentNode) teaserEl.parentNode.removeChild(teaserEl);
    teaserEl = null;
  }

  // --- State --------------------------------------------------------------
  var convId = (function () {
    try { return localStorage.getItem(STORAGE_KEY) || null; } catch (e) { return null; }
  })();
  var rendered = [];
  var lastSeenTs = null;   // timestamp of the newest agent/bot message already rendered
  var pollTimer = null;

  function startPolling() {
    stopPolling();
    if (!convId) return;
    pollTimer = setInterval(pollOnce, 3500);
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }
  function pollOnce() {
    if (!convId) return;
    var url = API_BASE + "/chat/poll/" + encodeURIComponent(vendorId) + "/" + encodeURIComponent(convId);
    if (lastSeenTs) url += "?since=" + encodeURIComponent(lastSeenTs);
    fetch(url, { method: "GET", mode: "cors", credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.messages || !d.messages.length) return;
        d.messages.forEach(function (m) {
          // Don't duplicate the reply we just rendered from send()
          if (lastSeenTs && m.created_at <= lastSeenTs) return;
          var label = m.role === "agent" ? "Live agent" : (botInfo.bot_name || "BotNira");
          addMsgRaw("bot", m.content, label);
          lastSeenTs = m.created_at;
        });
      })
      .catch(function () { /* silent */ });
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>()]+[^\s.,;:!?<>()])/gi;
  function richText(s) {
    var safe = escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(URL_RE, function (m) {
      var href = m.indexOf("http") === 0 ? m : "https://" + m;
      return '<a href="' + href + '" target="_blank" rel="noopener">' + m + "</a>";
    });
    // paragraphs
    return safe.split(/\n\s*\n/).map(function (p) {
      return "<p style=\"margin:0 0 6px 0\">" + p.replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }
  function addMsg(role, content) {
    addMsgRaw(role, content, role === "user" ? "You" : (botInfo.bot_name || "BotNira"));
  }
  function addMsgRaw(role, content, label) {
    var div = document.createElement("div");
    div.className = "bn-bubble " + (role === "user" ? "bn-user" : "bn-bot");
    div.innerHTML =
      '<span class="bn-label">' + escapeHtml(label) + "</span>" +
      richText(content);
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    rendered.push({ role: role, content: content });
  }
  function addTyping() {
    var t = document.createElement("div");
    t.className = "bn-typing";
    t.id = "bn-typing";
    t.textContent = (botInfo.bot_name || "BotNira") + " is typing…";
    msgsEl.appendChild(t);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  function removeTyping() {
    var t = q("#bn-typing");
    if (t) t.parentNode.removeChild(t);
  }

  function send(text) {
    if (!text || !text.trim()) return;
    addMsg("user", text);
    input.value = "";
    input.style.height = "auto";
    sendBtn.disabled = true;
    addTyping();
    fetch(API_BASE + "/chat/message", {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendor_id: vendorId,
        conversation_id: convId,
        message: text,
        channel: "web",
        customer_name: "Web visitor"
      })
    })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error("HTTP " + r.status + ": " + t.slice(0, 120)); });
        return r.json();
      })
      .then(function (d) {
        removeTyping();
        convId = d.conversation_id;
        try { localStorage.setItem(STORAGE_KEY, convId); } catch (e) {}
        addMsg("bot", d.reply);
        if (d.message && d.message.created_at) lastSeenTs = d.message.created_at;
        startPolling();  // ensure polling is running for agent replies
      })
      .catch(function (e) {
        removeTyping();
        var msg = (e && e.message) ? e.message : String(e);
        console.error("[BotNira] chat error:", msg);
        var hint = "I couldn't reach the BotNira server.\n\n";
        if (/failed to fetch/i.test(msg)) {
          hint +=
            "This usually means your website's **Content Security Policy** (CSP) is " +
            "blocking requests to BotNira.\n\nFix: add `" + scriptUrl.origin +
            "` to your site's CSP `connect-src` allowlist, or disable the CSP header " +
            "from your security plugin temporarily to confirm.";
        } else {
          hint += "(Technical: " + msg + ")";
        }
        addMsg("bot", hint);
      })
      .finally(function () { sendBtn.disabled = false; input.focus(); });
  }

  function open() {
    removeTeaser();
    dotEl.style.display = "none";
    panel.style.display = "flex";
    fab.style.display = "none";
    rememberDismissed();
    setTimeout(function () { input.focus(); }, 50);
    if (rendered.length === 0) {
      loadBotInfo(function () {
        nameEl.textContent = botInfo.bot_name || "BotNira";
        subEl.textContent = botInfo.vendor_name ? "From " + botInfo.vendor_name : "Online";
        addMsg("bot", botInfo.greeting || "Hi! How can I help you today?");
      });
    }
    startPolling();
  }
  function close() {
    panel.style.display = "none";
    fab.style.display = "flex";
    stopPolling();
  }

  fab.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  sendBtn.addEventListener("click", function () { send(input.value); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input.value); }
  });
  input.addEventListener("input", function () {
    input.style.height = "auto";
    input.style.height = Math.min(100, input.scrollHeight) + "px";
  });

  // Preload bot info, then show the teaser regardless (even on fetch error,
  // we still want the visitor to see the chat invite).
  loadBotInfo(function () {
    setTimeout(showTeaser, 1500);
  });
})();
