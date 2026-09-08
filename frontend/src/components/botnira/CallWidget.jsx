import { useEffect, useRef, useState, useCallback } from "react";
import { Device } from "@twilio/voice-sdk";
import { api } from "../../lib/api";
import { Phone, PhoneOff, Mic, MicOff, Loader2, X, MessageCircle } from "lucide-react";

const WS_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/^http/, "ws");

/**
 * Floating call widget (top-right). Handles two providers:
 *  - "twilio":   PSTN call via Twilio Voice SDK (voice/SMS threads, US/CA WhatsApp fallback)
 *  - "whatsapp": WhatsApp voice call over WebRTC (outbound callback + answering inbound)
 *
 * props:
 *   target   = { number, name, conversationId, provider }
 *   incoming = { call_id, session, from, name, conversation_id }  // inbound WhatsApp only
 *   onClose()
 */
export const CallWidget = ({ target, incoming, onClose }) => {
  const isWa = target.provider === "whatsapp" || !!incoming;
  const isIncoming = !!incoming;
  const accent = isWa ? "#25D366" : "#002FA7";

  const deviceRef = useRef(null);
  const callRef = useRef(null);
  const pcRef = useRef(null);
  const wsRef = useRef(null);
  const audioRef = useRef(null);
  const callIdRef = useRef(incoming?.call_id || null);
  const timerRef = useRef(null);
  const [phase, setPhase] = useState("connecting"); // connecting|ringing|in-call|ended|error
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const startTimer = () => {
    setPhase("in-call"); setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { callRef.current?.disconnect(); } catch (_) {}
    try { deviceRef.current?.destroy(); } catch (_) {}
    try {
      if (wsRef.current?.readyState === 1 && callIdRef.current)
        wsRef.current.send(JSON.stringify({ action: "terminate", call_id: callIdRef.current }));
    } catch (_) {}
    try { pcRef.current?.close(); } catch (_) {}
    try { wsRef.current?.close(); } catch (_) {}
    callRef.current = null; deviceRef.current = null; pcRef.current = null; wsRef.current = null;
  }, []);

  // ---- Twilio (PSTN) ----
  const runTwilio = useCallback(async (cancelledRef) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser doesn't support microphone calls.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    const { data } = await api.post("/voice/browser/token");
    if (cancelledRef.current) return;
    const device = new Device(data.token, { logLevel: "error", codecPreferences: ["opus", "pcmu"] });
    deviceRef.current = device;
    device.on("tokenWillExpire", async () => {
      try { const r = await api.post("/voice/browser/token"); device.updateToken(r.data.token); } catch (_) {}
    });
    device.on("error", (e) => { setError(e?.message || "Call error"); setPhase("error"); });
    const call = await device.connect({ params: { To: target.number, ConversationId: target.conversationId || "" } });
    callRef.current = call;
    setPhase("ringing");
    call.on("accept", startTimer);
    call.on("disconnect", () => { setPhase("ended"); if (timerRef.current) clearInterval(timerRef.current); });
    call.on("cancel", () => setPhase("ended"));
    call.on("error", (e) => { setError(e?.message || "Call error"); setPhase("error"); });
  }, [target]);

  // ---- WhatsApp (WebRTC via Meta Cloud API) ----
  const waitIce = (pc) => new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const check = () => { if (pc.iceGatheringState === "complete") { pc.removeEventListener("icegatheringstatechange", check); resolve(); } };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(resolve, 3000); // don't hang forever
  });

  const runWhatsApp = useCallback(async (cancelledRef) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser doesn't support microphone calls.");
    const { data: turn } = await api.get("/voice/turn");
    if (cancelledRef.current) return;
    const pc = new RTCPeerConnection({ iceServers: turn.ice_servers || [] });
    pcRef.current = pc;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => { if (audioRef.current) audioRef.current.srcObject = e.streams[0]; };
    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      if (st === "connected" || st === "completed") { if (phase !== "in-call") startTimer(); }
      if (st === "failed" || st === "disconnected") { setPhase("ended"); }
    };

    const token = localStorage.getItem("botnira_token");
    const ws = new WebSocket(`${WS_BASE}/api/ws/wa-call?token=${encodeURIComponent(token || "")}`);
    wsRef.current = ws;
    await new Promise((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error("Signaling connection failed")); });
    if (cancelledRef.current) return;

    ws.onmessage = async (evt) => {
      const m = JSON.parse(evt.data);
      if (m.type === "graph_result" && m.action === "connect") {
        const id = m.result?.calls?.[0]?.id; if (id) callIdRef.current = id;
      } else if (m.type === "call_permission_needed") {
        setError("WhatsApp requires the customer's permission before we can call them. We just sent them a call-permission request on WhatsApp — once they tap Accept, try the callback again."); setPhase("error");
      } else if (m.type === "wa_call_answer") {
        try { await pc.setRemoteDescription({ type: "answer", sdp: m.session?.sdp }); } catch (_) {}
      } else if (m.type === "wa_call_terminate") {
        setPhase("ended");
      } else if (m.type === "error") {
        setError(m.detail || "Call failed"); setPhase("error");
      }
    };

    if (isIncoming) {
      setPhase("ringing");
      await pc.setRemoteDescription({ type: "offer", sdp: incoming.session?.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitIce(pc);
      ws.send(JSON.stringify({ action: "pre_accept", call_id: incoming.call_id, sdp: pc.localDescription.sdp }));
      ws.send(JSON.stringify({ action: "accept", call_id: incoming.call_id, sdp: pc.localDescription.sdp }));
    } else {
      setPhase("ringing");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIce(pc);
      ws.send(JSON.stringify({ action: "connect", to: target.number, sdp: pc.localDescription.sdp }));
    }
  }, [target, incoming, isIncoming, phase]);

  useEffect(() => {
    const cancelledRef = { current: false };
    (async () => {
      try {
        if (isWa) await runWhatsApp(cancelledRef);
        else await runTwilio(cancelledRef);
      } catch (e) {
        if (cancelledRef.current) return;
        setError(e?.response?.data?.detail || e?.message || "Could not start the call.");
        setPhase("error");
      }
    })();
    return () => { cancelledRef.current = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hangup = () => { cleanup(); setPhase("ended"); };
  const toggleMute = () => {
    const n = !muted;
    if (callRef.current) callRef.current.mute(n);
    if (pcRef.current) pcRef.current.getSenders().forEach((s) => { if (s.track?.kind === "audio") s.track.enabled = !n; });
    setMuted(n);
  };
  const close = () => { cleanup(); onClose(); };

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const statusText = { connecting: "Connecting…", ringing: isIncoming ? "Answering…" : "Ringing…",
    "in-call": mmss, ended: "Call ended", error: "Couldn't connect" }[phase];
  const ringing = phase === "connecting" || phase === "ringing";
  const live = phase === "in-call";
  const name = target.name || incoming?.name || "Customer";
  const number = target.number || incoming?.from || "";
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

  return (
    <div data-testid="call-widget"
      className="fixed top-6 right-6 z-[90] w-[320px] bg-white border-2 border-black shadow-brutal-lg animate-in slide-in-from-top-2 fade-in duration-200">
      <audio ref={audioRef} autoPlay />
      <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />
      <div className="flex items-center justify-between px-4 py-2.5 border-b-2 border-black">
        <span className="font-display font-black text-xs uppercase tracking-wide flex items-center gap-2">
          {isWa ? <MessageCircle size={14} style={{ color: accent }} /> : <Phone size={14} style={{ color: accent }} />}
          {isWa ? (isIncoming ? "Incoming WhatsApp call" : "WhatsApp call") : "Calling back"}
        </span>
        <button data-testid="call-close-btn" onClick={close} aria-label="Close" className="p-1 hover:bg-neutral-100 transition-colors"><X size={16} /></button>
      </div>

      <div className="px-5 pt-6 pb-5 flex flex-col items-center text-center">
        <div className="relative mb-4">
          {ringing && <span className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ backgroundColor: accent }} />}
          <div className="relative w-20 h-20 rounded-full grid place-items-center font-display font-black text-2xl text-white border-2 border-black" style={{ backgroundColor: accent }}>{initials}</div>
          {live && <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 border-2 border-white grid place-items-center"><span className="w-2 h-2 rounded-full bg-white animate-pulse" /></span>}
        </div>
        <div className="font-display font-black text-lg leading-tight truncate max-w-full">{name}</div>
        <div className="text-xs font-mono text-neutral-500 mt-0.5 truncate max-w-full">{number}</div>
        <div className="mt-3 flex items-center justify-center gap-2 text-sm font-bold" data-testid="call-status">
          {ringing && <Loader2 size={14} className="animate-spin" />}
          <span className={live ? "text-green-600 tabular-nums" : phase === "error" ? "text-red-600" : "text-neutral-700"}>{statusText}</span>
        </div>
        {error && <div className="mt-2 text-xs text-red-600 leading-snug" data-testid="call-error">{error}</div>}

        <div className="mt-5 flex items-center justify-center gap-4">
          {(live || ringing) && (
            <>
              <button data-testid="call-mute-btn" onClick={toggleMute} disabled={!live}
                className={`w-14 h-14 grid place-items-center rounded-full border-2 border-black transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 ${muted ? "bg-yellow-300" : "bg-white"}`} title={muted ? "Unmute" : "Mute"}>
                {muted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <button data-testid="call-hangup-btn" onClick={hangup}
                className="w-14 h-14 grid place-items-center rounded-full border-2 border-black bg-red-600 text-white transition-all hover:-translate-y-0.5" title="Hang up"><PhoneOff size={20} /></button>
            </>
          )}
          {(phase === "ended" || phase === "error") && (
            <button data-testid="call-done-btn" onClick={close} className="px-6 py-2.5 border-2 border-black bg-white font-bold text-sm transition-all hover:-translate-y-0.5">Done</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CallWidget;
