import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { dayLabel, fmtDur, fmtSize, fmtTime, hueOf, isImage, sameDay } from '../lib.js';
import { useToast } from '../toast.jsx';

/* Turns http(s) links inside text into clickable links */
function Linkified({ text }) {
  return text.split(/(https?:\/\/[^\s<]+)/g).map((part, i) => {
    if (i % 2) return <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>;
    return part ? <Fragment key={i}>{part}</Fragment> : null;
  });
}

function FileCard({ f }) {
  const ext = ((f.name.includes('.') ? f.name.split('.').pop() : 'file') || 'file').slice(0, 4).toUpperCase();
  return (
    <a className="file" href={f.url} download={f.name} rel="noopener">
      <span className="file-ic">{ext}</span>
      <span className="file-info"><b>{f.name}</b><small>{fmtSize(f.size)}</small></span>
      <Icon id="download" />
    </a>
  );
}

let playingAudio = null; // only one voice message plays at a time

function AudioPlayer({ m }) {
  const toast = useToast();
  const N = 30;
  const [playing, setPlaying] = useState(false);
  const [frac, setFrac] = useState(0);
  const [cur, setCur] = useState(null); // null = show the full length
  const audioRef = useRef(null);

  const heights = useMemo(() => {
    let seed = parseInt(m.id.slice(0, 6), 16) || 7;
    return Array.from({ length: N }, () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return 22 + (seed % 68); });
  }, [m.id]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    audio.src = m.file.url;
    audioRef.current = audio;
    const total = () => m.dur || (isFinite(audio.duration) ? audio.duration : 0);
    audio.onplay = () => setPlaying(true);
    audio.onpause = () => setPlaying(false);
    audio.ontimeupdate = () => { const t = total(); setFrac(t ? Math.min(audio.currentTime / t, 1) : 0); setCur(audio.currentTime); };
    audio.onended = () => { setFrac(0); setCur(null); setPlaying(false); };
    return () => { audio.onpause = null; audio.pause(); if (playingAudio === audio) playingAudio = null; };
  }, [m.file.url, m.dur]);

  const toggle = () => {
    const audio = audioRef.current;
    if (audio.paused) {
      if (playingAudio && playingAudio !== audio) playingAudio.pause();
      playingAudio = audio;
      audio.play().catch(() => toast('This browser cannot play that voice message.'));
    } else audio.pause();
  };

  const on = Math.round(frac * N);
  return (
    <div className="audio">
      <button className="ap-btn" type="button" aria-label="Play voice message" onClick={toggle}><Icon id={playing ? 'pause' : 'play'} /></button>
      <div className="ap-bars">
        {heights.map((h, i) => <i key={i} className={i < on ? 'on' : ''} style={{ height: h + '%' }} />)}
      </div>
      <span className="ap-time">{fmtDur(cur == null ? m.dur : cur)}</span>
    </div>
  );
}

function Message({ chat, m, prev, mePin, onMedia }) {
  const mine = m.from === mePin;
  const cont = prev && sameDay(prev.ts, m.ts) && prev.from === m.from && m.ts - prev.ts < 5 * 60 * 1000;
  const big = m.kind === 'text' && /^(?:\p{Extended_Pictographic}|\u200d|\ufe0f|\s){1,6}$/u.test(m.text);
  return (
    <>
      {(!prev || !sameDay(prev.ts, m.ts)) && <div className="day">{dayLabel(m.ts)}</div>}
      <div className={'msg ' + (mine ? 'mine' : 'theirs') + (cont ? ' cont' : '')}>
        <div className={'bubble' + (big ? ' big' : '')} style={{ '--h': hueOf(m.from) }}>
          {chat.type === 'group' && !mine && !cont && <span className="from">{m.fromName}</span>}
          {m.kind === 'text' && <Linkified text={m.text} />}
          {m.kind === 'audio' && <AudioPlayer m={m} />}
          {m.kind === 'file' && m.file && (isImage(m.file)
            ? <a className="pic" href={m.file.url} target="_blank" rel="noopener"><img src={m.file.url} alt={m.file.name} loading="lazy" onLoad={onMedia} /></a>
            : <FileCard f={m.file} />)}
          <span className="meta">{fmtTime(m.ts)}</span>
        </div>
      </div>
    </>
  );
}

export function Messages({ chat, mePin }) {
  const box = useRef(null);
  const stick = useRef(true);
  const toBottom = (smooth) => {
    const b = box.current;
    if (!b) return;
    b.style.scrollBehavior = smooth ? 'smooth' : 'auto';
    b.scrollTop = b.scrollHeight;
  };
  const onScroll = () => {
    const b = box.current;
    stick.current = b.scrollHeight - b.scrollTop - b.clientHeight < 120;
  };

  /* opening another chat, or its history arriving: jump to the newest message */
  useLayoutEffect(() => { stick.current = true; toBottom(false); }, [chat.key, chat.loaded]);

  /* a new message: follow it if you were at the bottom or you sent it */
  const count = chat.messages.length;
  const last = chat.messages[count - 1];
  useLayoutEffect(() => { if (stick.current || (last && last.from === mePin)) toBottom(true); }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMedia = () => { if (stick.current) toBottom(false); };

  return (
    <div id="msgs" className="msgs" role="log" aria-live="polite" ref={box} onScroll={onScroll}>
      {!count ? (
        <div className="hello">
          {chat.loaded
            ? (chat.type === 'group' ? 'This is the start of the ' + chat.name + '. Say hi.' : 'Say hi to ' + chat.name + '. Only you two can see this chat.')
            : 'Loading messages...'}
        </div>
      ) : chat.messages.map((m, i) => (
        <Message key={m.id} chat={chat} m={m} prev={chat.messages[i - 1]} mePin={mePin} onMedia={onMedia} />
      ))}
    </div>
  );
}
