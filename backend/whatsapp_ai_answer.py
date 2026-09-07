"""Server-side AI answering for inbound WhatsApp calls.

WhatsApp calls are WebRTC (Opus). To let the AI answer them the way Twilio calls
are answered, the SERVER becomes the WebRTC peer (via aiortc):

  WhatsApp caller ──WebRTC/Opus──> aiortc (this server) ──PCM──> OpenAI Realtime
                   <──WebRTC/Opus── aiortc              <──PCM── (AI voice)

We accept Meta's inbound-call SDP offer, answer it with aiortc, decode the
caller's Opus to PCM, feed it to OpenAI Realtime (same GA model/persona as the
Twilio phone AI), and stream the AI's PCM voice back as Opus. Transcripts are
written to the same WhatsApp inbox thread, and a summary is generated on hangup.

Audio: OpenAI Realtime uses PCM16 mono @ 24 kHz; WebRTC uses 48 kHz. We resample
both directions with PyAV.
"""
import asyncio
import base64
import fractions
import json
import time
from typing import Dict, Optional

import av
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import MediaStreamTrack

import server as _s

OAI_RATE = 24000          # OpenAI Realtime PCM rate
WEBRTC_RATE = 48000       # WebRTC Opus rate
FRAME_MS = 20
SAMPLES_PER_FRAME = WEBRTC_RATE * FRAME_MS // 1000  # 960 samples @48k / 20ms

# call_id -> {"pc": RTCPeerConnection, "task": Task, "stop": Event}
_active: Dict[str, dict] = {}


class AIAudioTrack(MediaStreamTrack):
    """Outgoing audio track: yields 20ms @48k PCM frames pulled from a buffer
    that's fed (24k) by the OpenAI Realtime audio deltas."""
    kind = "audio"

    def __init__(self):
        super().__init__()
        self._buf = bytearray()            # 48k s16 mono PCM waiting to be sent
        self._lock = asyncio.Lock()
        self._resampler = av.AudioResampler(format="s16", layout="mono", rate=WEBRTC_RATE)
        self._pts = 0
        self._start = None

    async def push_oai_pcm(self, pcm24: bytes):
        """Feed PCM16 mono @24k from OpenAI; resample to 48k and buffer it."""
        frame = av.AudioFrame(format="s16", layout="mono", samples=len(pcm24) // 2)
        frame.sample_rate = OAI_RATE
        frame.pts = None
        frame.planes[0].update(pcm24)
        async with self._lock:
            for out in self._resampler.resample(frame):
                self._buf.extend(bytes(out.planes[0]))

    async def clear(self):
        async with self._lock:
            self._buf.clear()

    async def recv(self):
        # Pace to real time: one 20ms frame every 20ms.
        if self._start is None:
            self._start = time.time()
        target = self._start + (self._pts / WEBRTC_RATE)
        delay = target - time.time()
        if delay > 0:
            await asyncio.sleep(delay)

        need = SAMPLES_PER_FRAME * 2  # bytes for one 20ms frame
        async with self._lock:
            if len(self._buf) >= need:
                chunk = bytes(self._buf[:need]); del self._buf[:need]
            else:
                chunk = bytes(self._buf) + b"\x00" * (need - len(self._buf)); self._buf.clear()

        frame = av.AudioFrame(format="s16", layout="mono", samples=SAMPLES_PER_FRAME)
        frame.sample_rate = WEBRTC_RATE
        frame.planes[0].update(chunk)
        frame.pts = self._pts
        frame.time_base = fractions.Fraction(1, WEBRTC_RATE)
        self._pts += SAMPLES_PER_FRAME
        return frame


def _build_instructions(vendor: dict, bot: dict) -> tuple:
    biz = (bot or {}).get("business_description") or (vendor or {}).get("business_description") or ""
    greeting = (bot or {}).get("greeting") or f"Hi, welcome to {vendor.get('name','our business')}. How can I help?"
    tone = (bot or {}).get("tone") or "friendly and professional"
    faqs = (bot or {}).get("faqs") or []
    faq_txt = "\n".join([f"- {f.get('q','')} → {f.get('a','')}" for f in faqs[:30]]) if faqs else ""
    instr = (
        f"You are BotNira, a voice AI receptionist for {vendor.get('name','this business')}. "
        f"Speak in a {tone} tone. Keep replies short (1-3 sentences).\n\n"
        f"BUSINESS INFO (strict source of truth — do NOT invent anything beyond this):\n{biz}\n\n"
        f"FAQs:\n{faq_txt}\n\n"
        f"If you don't know an answer, say 'Let me have someone from our team follow up with you.' "
        f"If the caller wants to book an appointment, collect name, phone and preferred date/time, then confirm it back."
    )
    return instr, greeting


async def start_ai_answer(call: dict, wc: dict, conv_id: str):
    """Accept an inbound WhatsApp call and bridge it to OpenAI Realtime."""
    call_id = call.get("id")
    if not call_id or call_id in _active:
        return
    if not _s.OPENAI_REALTIME_API_KEY:
        _s.logger.warning("[wa-ai] OPENAI_REALTIME_API_KEY missing — cannot AI-answer WhatsApp call")
        return
    offer = (call.get("session") or {}).get("sdp")
    if not offer:
        _s.logger.warning("[wa-ai] inbound call %s has no SDP offer", call_id)
        return

    vendor_id = wc["vendor_id"]
    phone_id = wc["phone_number_id"]
    token = wc.get("access_token") or _s.META_SYSTEM_USER_TOKEN
    vendor = await _s.db.vendors.find_one({"id": vendor_id}, {"_id": 0})
    bot = await _s.db.bots.find_one({"vendor_id": vendor_id}, {"_id": 0})
    instructions, greeting = _build_instructions(vendor or {}, bot or {})

    pc = RTCPeerConnection()
    ai_track = AIAudioTrack()
    pc.addTrack(ai_track)
    stop = asyncio.Event()
    _active[call_id] = {"pc": pc, "stop": stop}

    import websockets as _ws
    oai_url = f"wss://api.openai.com/v1/realtime?model={_s.OPENAI_REALTIME_MODEL}"
    oai_headers = [("Authorization", f"Bearer {_s.OPENAI_REALTIME_API_KEY}")]

    async def run():
        try:
            await pc.setRemoteDescription(RTCSessionDescription(sdp=offer, type="offer"))
            answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)  # aiortc gathers ICE here (non-trickle)

            # Accept the WhatsApp call with our SDP answer.
            from whatsapp_call_routes import _graph_post
            try:
                await _graph_post(f"{phone_id}/calls", token, {
                    "messaging_product": "whatsapp", "action": "accept", "call_id": call_id,
                    "session": {"sdp_type": "answer", "sdp": pc.localDescription.sdp},
                })
            except Exception as e:
                _s.logger.warning("[wa-ai] accept failed for %s: %s", call_id, e)
                return

            async with _ws.connect(oai_url, additional_headers=oai_headers, max_size=None,
                                   ping_interval=20, ping_timeout=20) as oai:
                await oai.send(json.dumps({
                    "type": "session.update",
                    "session": {
                        "type": "realtime",
                        "output_modalities": ["audio"],
                        "instructions": instructions,
                        "audio": {
                            "input": {
                                "format": {"type": "audio/pcm", "rate": OAI_RATE},
                                "turn_detection": {"type": "server_vad", "threshold": 0.6,
                                                   "prefix_padding_ms": 300, "silence_duration_ms": 500,
                                                   "create_response": True},
                                "transcription": {"model": "whisper-1"},
                            },
                            "output": {"format": {"type": "audio/pcm", "rate": OAI_RATE}, "voice": "alloy"},
                        },
                    },
                }))
                # Greet first.
                await oai.send(json.dumps({"type": "response.create",
                    "response": {"output_modalities": ["audio"],
                                 "instructions": f"Greet the caller warmly in one short sentence: {greeting}"}}))

                # ---- incoming caller audio → OpenAI ----
                async def caller_to_oai():
                    in_resampler = av.AudioResampler(format="s16", layout="mono", rate=OAI_RATE)

                    @pc.on("track")
                    def on_track(track):
                        if track.kind != "audio":
                            return
                        async def pump():
                            try:
                                while not stop.is_set():
                                    frame = await track.recv()
                                    for r in in_resampler.resample(frame):
                                        pcm = bytes(r.planes[0])
                                        await oai.send(json.dumps({"type": "input_audio_buffer.append",
                                                                   "audio": base64.b64encode(pcm).decode()}))
                            except Exception:
                                stop.set()
                        asyncio.create_task(pump())

                    await stop.wait()

                # ---- OpenAI events → caller audio + transcripts ----
                async def oai_to_caller():
                    try:
                        async for msg in oai:
                            ev = json.loads(msg)
                            t = ev.get("type")
                            if t == "response.output_audio.delta":
                                await ai_track.push_oai_pcm(base64.b64decode(ev["delta"]))
                            elif t == "input_audio_buffer.speech_started":
                                await ai_track.clear()  # barge-in: drop queued AI audio
                                try: await oai.send(json.dumps({"type": "response.cancel"}))
                                except Exception: pass
                            elif t == "response.output_audio_transcript.done":
                                txt = ev.get("transcript", "")
                                if txt:
                                    await _s._push_message(conv_id, vendor_id, "bot", txt)
                                    try: await _s._maybe_book_appointment(vendor_id, conv_id, txt)
                                    except Exception: pass
                            elif t == "conversation.item.input_audio_transcription.completed":
                                txt = ev.get("transcript", "")
                                if txt:
                                    await _s._push_message(conv_id, vendor_id, "user", txt)
                            elif t == "error":
                                _s.logger.warning("[wa-ai] openai error: %s", ev.get("error"))
                    except Exception as e:
                        _s.logger.info("[wa-ai] oai stream ended: %s", e)
                    finally:
                        stop.set()

                await asyncio.gather(caller_to_oai(), oai_to_caller(), return_exceptions=True)
        except Exception as e:
            _s.logger.exception("[wa-ai] bridge error for %s: %s", call_id, e)
        finally:
            try: await pc.close()
            except Exception: pass
            _active.pop(call_id, None)
            _s.logger.info("[wa-ai] call %s bridge closed", call_id)

    _active[call_id]["task"] = asyncio.create_task(run())
    _s.logger.info("[wa-ai] AI answering WhatsApp call %s (conv %s)", call_id, conv_id)


async def stop_ai_answer(call_id: str):
    entry = _active.get(call_id)
    if not entry:
        return
    entry["stop"].set()
    try:
        await entry["pc"].close()
    except Exception:
        pass
    _active.pop(call_id, None)
