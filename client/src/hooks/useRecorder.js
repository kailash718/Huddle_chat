import { useCallback, useRef, useState } from 'react';
import { fmtDur, secureOK } from '../lib.js';

/* Voice-note recorder. getChat() returns the chat that is open right now. */
export function useRecorder({ getChat, upload, emitMsg, toast }) {
  const [recording, setRecording] = useState(false);
  const [time, setTime] = useState('0:00');
  const rec = useRef({ mr: null, chunks: [], t0: 0, timer: null, cancel: false, chat: null });

  const stop = useCallback((cancel) => {
    const r = rec.current;
    if (!r.mr || r.mr.state === 'inactive') return;
    r.cancel = !!cancel;
    r.mr.stop();
  }, []);

  const start = useCallback(async () => {
    const r = rec.current;
    if (r.mr) return;
    if (!secureOK() || !window.MediaRecorder) { toast('Voice messages need the secure link (https). Ask the host for it.'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (_) { toast('Microphone is blocked. Allow it in the address bar and try again.'); return; }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    Object.assign(r, { mr, chunks: [], t0: Date.now(), cancel: false, chat: getChat() });
    mr.ondataavailable = (e) => { if (e.data && e.data.size) r.chunks.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(r.timer);
      const secs = (Date.now() - r.t0) / 1000;
      const type = mr.mimeType || mime || 'audio/webm';
      const c = r.chat;
      r.mr = null;
      setRecording(false);
      if (r.cancel) return;
      if (secs < 0.8) { toast('That was too short. Hold on a little longer.'); return; }
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([new Blob(r.chunks, { type })], 'voice-message.' + ext, { type });
      try {
        const meta = await upload(file, 'voice message');
        await emitMsg({ to: c.pin, kind: 'audio', file: meta, dur: Math.round(secs) });
      } catch (ex) { toast(ex.message); }
    };
    mr.start(250);
    setTime('0:00');
    setRecording(true);
    r.timer = setInterval(() => {
      const s = (Date.now() - r.t0) / 1000;
      setTime(fmtDur(s));
      if (s > 300) stop(false);
    }, 250);
  }, [getChat, upload, emitMsg, toast, stop]);

  return { recording, time, start, stop };
}
