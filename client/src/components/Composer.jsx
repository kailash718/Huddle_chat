import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';

const EMOJI = '😀 😂 🥹 😍 😎 🤔 😅 😭 🙏 👍 👎 👏 🙌 🔥 ✨ 💯 ❤️ 💜 🎉 🥳 😴 🤯 😤 🫡 👀 💀 ☕ 📚 💻 🧠 ✅ ❌ 🍕 🎧 🚀 😇 🤝 🫶 🙈 🤣 😉 😊 🥲 😬 🤞 💪 🎯'.split(' ');

export function Composer({ chat, socketRef, onSendText, onSendFiles, rec }) {
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const ta = useRef(null);
  const field = useRef(null);
  const fileInput = useRef(null);
  const caret = useRef(null);
  const typingSentAt = useRef(0);
  const typingOff = useRef(null);
  const has = text.trim().length > 0;

  /* grow the box as you type; restore the caret after an emoji is inserted */
  useLayoutEffect(() => {
    const t = ta.current;
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 140) + 'px';
    if (caret.current != null) { t.selectionStart = t.selectionEnd = caret.current; caret.current = null; t.focus(); }
  }, [text]);

  useEffect(() => { setEmojiOpen(false); }, [chat.key]);
  useEffect(() => {
    const click = (e) => { if (field.current && !field.current.contains(e.target)) setEmojiOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setEmojiOpen(false); };
    document.addEventListener('click', click);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', click); document.removeEventListener('keydown', key); };
  }, []);

  /* focus the box on desktop when a chat opens */
  useEffect(() => { if (window.matchMedia('(hover: hover)').matches) ta.current.focus(); }, [chat.key]);

  const emitTyping = (on) => socketRef.current && socketRef.current.emit('typing', { to: chat.pin, on });

  const onChange = (e) => {
    setText(e.target.value);
    const now = Date.now();
    if (now - typingSentAt.current > 2000) { emitTyping(true); typingSentAt.current = now; }
    clearTimeout(typingOff.current);
    const pin = chat.pin;
    typingOff.current = setTimeout(() => {
      if (socketRef.current) socketRef.current.emit('typing', { to: pin, on: false });
      typingSentAt.current = 0;
    }, 2500);
  };

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSendText(t);
    setText('');
    clearTimeout(typingOff.current);
    typingSentAt.current = 0;
    emitTyping(false);
  };

  const addEmoji = (e) => {
    const t = ta.current;
    const s = t.selectionStart, en = t.selectionEnd;
    caret.current = s + e.length;
    setText(text.slice(0, s) + e + text.slice(en));
  };

  return (
    <>
      <form id="composer" className="composer" autoComplete="off" hidden={rec.recording} onSubmit={(e) => { e.preventDefault(); send(); }}>
        <button type="button" id="btn-attach" className="ib" aria-label="Attach a file" onClick={() => fileInput.current.click()}><Icon id="clip" /></button>
        <input type="file" id="file-input" multiple hidden ref={fileInput} onChange={(e) => { onSendFiles([...e.target.files]); e.target.value = ''; }} />
        <div className="field" ref={field}>
          <textarea
            id="text" rows={1} maxLength={4000} placeholder="Message" aria-label="Message" ref={ta} value={text}
            onChange={onChange}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          />
          <button type="button" id="btn-emoji" className="ib flat" aria-label="Emoji" onClick={() => setEmojiOpen((o) => !o)}><Icon id="smile" /></button>
          <div id="emoji" className="emoji-pop" hidden={!emojiOpen}>
            {EMOJI.map((e) => <button key={e} type="button" onClick={() => addEmoji(e)}>{e}</button>)}
          </div>
        </div>
        <button type="button" id="btn-mic" className="ib round" aria-label="Record a voice message" hidden={has} onClick={rec.start}><Icon id="mic" /></button>
        <button type="submit" id="btn-send" className="ib round send" aria-label="Send" hidden={!has}><Icon id="send" /></button>
      </form>

      <div id="rec-bar" className="rec-bar" hidden={!rec.recording}>
        <button type="button" id="rec-cancel" className="ib" aria-label="Cancel recording" onClick={() => rec.stop(true)}><Icon id="x" /></button>
        <span className="rec-dot" />
        <span id="rec-time" className="rec-time">{rec.time}</span>
        <span className="rec-hint">Recording your voice message</span>
        <button type="button" id="rec-send" className="ib round send" aria-label="Send voice message" onClick={() => rec.stop(false)}><Icon id="send" /></button>
      </div>
    </>
  );
}
