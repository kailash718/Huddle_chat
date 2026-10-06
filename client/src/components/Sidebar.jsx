import { useState } from 'react';
import { Icon } from './Icon.jsx';
import { Avatar } from './Avatar.jsx';
import { Mark } from './Auth.jsx';
import { copyText, digitsOnly, fmtTime, isImage } from '../lib.js';
import { useToast } from '../toast.jsx';

function previewText(c, mePin) {
  const m = c.last;
  if (!m) return 'No messages yet';
  let body = m.text;
  if (m.kind === 'audio') body = 'Voice message';
  else if (m.kind === 'file') body = isImage(m.file) ? 'Photo' : m.file.name;
  let who = '';
  if (m.from === mePin) who = 'You: ';
  else if (c.type === 'group') who = (m.fromName || '').split(' ')[0] + ': ';
  return who + body;
}

export function Sidebar({ me, chats, activeKey, online, voice, conn, onSelect, onOpenPin, onSignOut }) {
  const toast = useToast();
  const [pin, setPin] = useState('');

  const list = [...chats].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'group' ? -1 : 1;
    return (b.last ? b.last.ts : 0) - (a.last ? a.last.ts : 0);
  });

  const go = async (e) => {
    e.preventDefault();
    const p = pin.trim();
    if (!/^\d{4}$/.test(p)) return toast('A PIN is exactly 4 digits.');
    if (await onOpenPin(p)) setPin('');
  };
  const copyMine = async () => toast((await copyText(me.pin)) ? 'Your PIN ' + me.pin + ' is copied' : 'Your PIN is ' + me.pin);

  const voiceChat = voice.group ? chats.find((c) => c.type === 'group' && c.pin === voice.group) : null;

  return (
    <aside className="side">
      <div className="side-top">
        <div className="brand"><Mark /><span>Huddle</span></div>
        <button id="me-card" className="me" type="button" title="Copy my PIN" onClick={copyMine}>
          <span id="me-avatar"><Avatar name={me.name} pin={me.pin} /></span>
          <span className="me-text"><b id="me-name">{me.name}</b><small>Tap to copy your PIN</small></span>
          <span className="pin-chip" id="me-pin">{me.pin}</span>
        </button>
        <form id="go-form" className="go" autoComplete="off" onSubmit={go}>
          <input id="go-pin" inputMode="numeric" maxLength={4} placeholder="Type a PIN to chat" aria-label="PIN to chat with" value={pin} onChange={(e) => setPin(digitsOnly(e.target.value))} />
          <button className="btn-primary sm" type="submit">Open</button>
        </form>
      </div>

      <nav id="chat-list" className="chat-list" aria-label="Chats">
        {!list.length && <p className="list-empty">No chats yet. Type a PIN above to start one.</p>}
        {list.map((c) => (
          <button key={c.key} type="button" className={'chat-item' + (c.key === activeKey ? ' active' : '')} onClick={() => onSelect(c.key)}>
            <Avatar name={c.name} pin={c.pin} type={c.type} online={c.type === 'dm' && online.has(c.pin)} />
            <span className="ci-mid">
              <span className="ci-top"><b>{c.name}</b><time>{c.last ? fmtTime(c.last.ts) : ''}</time></span>
              <span className="ci-bot">
                <span className="ci-prev">{previewText(c, me.pin)}</span>
                {c.type === 'group' && c.voice && c.voice.length ? (
                  <span className="live" title={c.voice.length + ' in voice'}><Icon id="headphones" />{c.voice.length}</span>
                ) : c.unread ? (
                  <span className="badge">{c.unread > 99 ? '99+' : c.unread}</span>
                ) : null}
              </span>
            </span>
          </button>
        ))}
      </nav>

      {voice.group && (
        <div id="dock" className="dock">
          <span className="dock-ic"><Icon id="headphones" /></span>
          <span className="dock-text"><b>In voice</b><small id="dock-name">{voiceChat ? voiceChat.name : 'Group'}</small></span>
          <button id="dock-mute" className="ib sm" type="button" aria-label="Mute" onClick={() => voice.mute(!voice.muted)}><Icon id={voice.muted ? 'mic-off' : 'mic'} /></button>
          <button id="dock-leave" className="ib sm danger" type="button" aria-label="Leave voice" onClick={() => voice.leave()}><Icon id="hangup" /></button>
        </div>
      )}

      <div className="side-foot">
        <span id="conn" className={'conn ' + (conn.ok ? 'ok' : 'bad')}><i /><span>{conn.text}</span></span>
        <button id="signout" className="link" type="button" onClick={onSignOut}><Icon id="logout" />Sign out</button>
      </div>
    </aside>
  );
}
