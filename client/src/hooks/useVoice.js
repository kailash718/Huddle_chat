import { useEffect, useMemo, useRef, useState } from 'react';
import { secureOK } from '../lib.js';

const rtcConfig = { iceServers: [] }; // same network: no STUN/TURN needed

/* Voice lounge: WebRTC mesh between everyone in the group call.
 * The heavy state lives in a plain object (V) so socket callbacks never go stale;
 * React state (group, muted) only mirrors what the UI needs to draw. */
function createVoice({ V, socketRef, toast, setGroup, setMuted }) {
  const sock = () => socketRef.current;

  function addMeter(id, stream) {
    if (!V.ctx) return;
    try {
      const src = V.ctx.createMediaStreamSource(stream);
      const an = V.ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      V.meters.set(id, { an, buf: new Uint8Array(an.fftSize), lvl: 0, speaking: false });
    } catch (_) { /* ignore */ }
  }

  function closePeer(sid) {
    const p = V.peers.get(sid);
    if (!p) return;
    try { p.pc.close(); } catch (_) { /* ignore */ }
    if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
    V.peers.delete(sid);
    V.meters.delete(sid);
  }

  function stopLocal() {
    if (V.stream) V.stream.getTracks().forEach((t) => t.stop());
    V.stream = null;
  }

  function connectPeer(sid, initiator) {
    const pc = new RTCPeerConnection(rtcConfig);
    const peer = { sid, pc, pending: [], audio: null };
    V.peers.set(sid, peer);
    V.stream.getTracks().forEach((t) => pc.addTrack(t, V.stream));
    pc.onicecandidate = (e) => { if (e.candidate) sock().emit('voice:signal', { to: sid, data: { candidate: e.candidate } }); };
    pc.ontrack = (e) => {
      if (peer.audio) return;
      const a = document.createElement('audio');
      a.autoplay = true; a.setAttribute('playsinline', '');
      a.srcObject = e.streams[0];
      document.getElementById('voice-audio').appendChild(a);
      peer.audio = a;
      a.play().catch(() => {});
      addMeter(sid, e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        toast('Could not reach someone in the call. The network may be blocking voice between PCs.');
        closePeer(sid);
      }
    };
    if (initiator) {
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .then(() => sock().emit('voice:signal', { to: sid, data: { sdp: pc.localDescription } }))
        .catch(() => {});
    }
    return peer;
  }

  async function flushPending(peer) {
    while (peer.pending.length) { try { await peer.pc.addIceCandidate(peer.pending.shift()); } catch (_) { /* ignore */ } }
  }

  return {
    async join(group) {
      if (V.group) return;
      if (!secureOK()) { toast('Voice calls need the secure link (https). Ask the host for it.'); return; }
      try {
        V.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      } catch (_) { toast('Microphone is blocked. Allow it in the address bar and try again.'); return; }
      V.ctx = V.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (V.ctx.state === 'suspended') V.ctx.resume();
      sock().emit('voice:join', { group }, (res) => {
        if (!res || res.error) { stopLocal(); toast(res ? res.error : 'Could not join voice'); return; }
        V.group = group; V.muted = false;
        addMeter(sock().id, V.stream);
        res.peers.forEach((p) => connectPeer(p.sid, true));
        setGroup(group); setMuted(false);
      });
    },

    leave(silent) {
      if (!V.group && !V.stream) return;
      for (const sid of [...V.peers.keys()]) closePeer(sid);
      stopLocal();
      V.meters.clear();
      V.group = null; V.muted = false;
      if (!silent && sock()) sock().emit('voice:leave');
      setGroup(null); setMuted(false);
    },

    mute(m) {
      if (!V.group) return;
      V.muted = m;
      V.stream.getAudioTracks().forEach((t) => { t.enabled = !m; });
      sock().emit('voice:mute', { muted: m });
      setMuted(m);
    },

    /* server says who is in the call now: drop connections to people who left */
    onState({ group, participants }) {
      if (V.group !== group) return;
      for (const sid of [...V.peers.keys()]) {
        if (!participants.some((p) => p.sid === sid)) closePeer(sid);
      }
    },

    async onSignal({ from, data }) {
      if (!V.group || !V.stream || !data) return;
      let peer = V.peers.get(from);
      try {
        if (data.sdp) {
          if (data.sdp.type === 'offer') {
            if (!peer) peer = connectPeer(from, false);
            await peer.pc.setRemoteDescription(data.sdp);
            await flushPending(peer);
            const ans = await peer.pc.createAnswer();
            await peer.pc.setLocalDescription(ans);
            sock().emit('voice:signal', { to: from, data: { sdp: peer.pc.localDescription } });
          } else if (data.sdp.type === 'answer' && peer) {
            await peer.pc.setRemoteDescription(data.sdp);
            await flushPending(peer);
          }
        } else if (data.candidate && peer) {
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate);
          else peer.pending.push(data.candidate);
        }
      } catch (_) { /* ignore a bad signal */ }
    }
  };
}

export function useVoice(socketRef, toast) {
  const V = useRef({ group: null, stream: null, peers: new Map(), muted: false, ctx: null, meters: new Map() }).current;
  const [group, setGroup] = useState(null);
  const [muted, setMuted] = useState(false);
  const api = useMemo(() => createVoice({ V, socketRef, toast, setGroup, setMuted }), [V, socketRef, toast]);

  useEffect(() => {
    /* speaking rings: read the level of every stream 10x a second, paint the orbs directly */
    const timer = setInterval(() => {
      if (!V.meters.size) return;
      const mySid = socketRef.current && socketRef.current.id;
      V.meters.forEach((m, id) => {
        m.an.getByteTimeDomainData(m.buf);
        let sum = 0;
        for (let i = 0; i < m.buf.length; i++) { const x = (m.buf[i] - 128) / 128; sum += x * x; }
        let lvl = Math.min(1, Math.sqrt(sum / m.buf.length) * 7);
        if (id === mySid && V.muted) lvl = 0;
        m.lvl = m.lvl * 0.45 + lvl * 0.55;
        m.speaking = m.lvl > 0.14;
        const o = document.querySelector('#orbs [data-sid="' + id + '"]');
        if (o) { o.style.setProperty('--lvl', m.lvl.toFixed(2)); o.classList.toggle('talking', m.speaking); }
      });
    }, 100);
    const bye = () => { if (V.group && socketRef.current) socketRef.current.emit('voice:leave'); };
    window.addEventListener('pagehide', bye);
    return () => { clearInterval(timer); window.removeEventListener('pagehide', bye); api.leave(true); };
  }, [V, api, socketRef]);

  return { group, muted, join: api.join, leave: api.leave, mute: api.mute, onState: api.onState, onSignal: api.onSignal };
}
