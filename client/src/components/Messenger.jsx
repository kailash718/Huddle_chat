import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Sidebar } from './Sidebar.jsx';
import { ChatPane } from './ChatPane.jsx';
import { chatsReducer } from '../chatsReducer.js';
import { useVoice } from '../hooks/useVoice.js';
import { useUpload } from '../hooks/useUpload.js';
import { useRecorder } from '../hooks/useRecorder.js';
import { useToast } from '../toast.jsx';
import { ck } from '../lib.js';

/* The signed-in app. Owns the socket and all chat state. */
export function Messenger({ me, config, onAuthFail, onSignOut }) {
  const toast = useToast();
  const [chats, dispatch] = useReducer(chatsReducer, {});
  const [online, setOnline] = useState(() => new Set());
  const [typing, setTyping] = useState({});            // chatKey -> { pin: name }
  const [activeKey, setActiveKey] = useState(null);
  const [conn, setConn] = useState({ ok: false, text: 'Connecting' });
  const [sid, setSid] = useState(null);

  const socketRef = useRef(null);
  const activeRef = useRef(null); activeRef.current = activeKey;
  const typingTimers = useRef(new Map());
  const authFailRef = useRef(onAuthFail); authFailRef.current = onAuthFail;

  const voice = useVoice(socketRef, toast);
  const voiceRef = useRef(voice); voiceRef.current = voice;
  const { progress, upload } = useUpload(me, config.maxFileMb);

  const emitMsg = useCallback((payload) => new Promise((resolve) => {
    socketRef.current.emit('msg:send', payload, (res) => { if (res && res.error) toast(res.error); resolve(); });
  }), [toast]);

  const markRead = useCallback((key) => {
    const pin = key.split(':')[1];
    if (socketRef.current) socketRef.current.emit('chat:read', { pin });
    dispatch({ type: 'read', key });
  }, []);

  const loadChat = useCallback((pin) => {
    socketRef.current.emit('chat:open', { pin }, (res) => {
      if (!res || res.error) return toast(res ? res.error : 'Could not load this chat');
      dispatch({ type: 'loaded', info: res.chat, messages: res.messages });
    });
  }, [toast]);

  /* ---------------------------- socket ---------------------------- */
  useEffect(() => {
    const socket = io({ auth: { pin: me.pin, token: me.token }, reconnectionDelayMax: 3000 });
    socketRef.current = socket;
    const timers = typingTimers.current;

    const clearTyper = (key, from) => setTyping((t) => {
      const k = { ...(t[key] || {}) };
      delete k[from];
      return { ...t, [key]: k };
    });

    socket.on('connect_error', (err) => {
      if (err && err.message === 'auth') { socket.close(); authFailRef.current(); }
      else setConn({ ok: false, text: 'Reconnecting' });
    });
    socket.on('connect', () => { setConn({ ok: true, text: 'Connected' }); setSid(socket.id); });
    socket.on('disconnect', () => { setConn({ ok: false, text: 'Reconnecting' }); setSid(null); voiceRef.current.leave(true); });

    socket.on('init', (d) => {
      setOnline(new Set(d.online));
      dispatch({ type: 'init', chats: d.chats });
      const key = activeRef.current;
      if (key) { loadChat(key.split(':')[1]); markRead(key); }
    });

    socket.on('msg:new', ({ chat, message }) => {
      const key = ck(chat.type, chat.pin);
      const mine = message.from === me.pin;
      const seen = activeRef.current === key && !document.hidden;
      dispatch({ type: 'message', chat, message, bump: !mine && !seen });
      if (seen && !mine) markRead(key);
    });

    socket.on('typing', (d) => {
      const key = ck(d.type, d.chat);
      const tk = key + '|' + d.from;
      clearTimeout(timers.get(tk));
      if (d.on) {
        setTyping((t) => ({ ...t, [key]: { ...(t[key] || {}), [d.from]: d.name } }));
        timers.set(tk, setTimeout(() => clearTyper(key, d.from), 3500));
      } else clearTyper(key, d.from);
    });

    socket.on('presence', ({ pin, online: on }) => setOnline((prev) => {
      const n = new Set(prev);
      if (on) n.add(pin); else n.delete(pin);
      return n;
    }));
    socket.on('chat:read', ({ pin }) => dispatch({ type: 'readPin', pin }));
    socket.on('group:members', ({ pin, members }) => dispatch({ type: 'members', pin, members }));
    socket.on('voice:state', (d) => { dispatch({ type: 'voice', group: d.group, participants: d.participants }); voiceRef.current.onState(d); });
    socket.on('voice:signal', (d) => voiceRef.current.onSignal(d));

    return () => { timers.forEach(clearTimeout); timers.clear(); socket.close(); socketRef.current = null; };
  }, [me.pin, me.token, loadChat, markRead]);

  /* ---------------------------- actions --------------------------- */
  const selectChat = (key) => {
    const c = chats[key];
    if (!c) return;
    setActiveKey(key);
    if (!c.loaded) loadChat(c.pin);
    markRead(key);
  };

  const openByPin = (pin) => new Promise((resolve) => {
    socketRef.current.emit('chat:open', { pin }, (res) => {
      if (!res || res.error) { toast(res ? res.error : 'No answer from the server'); return resolve(false); }
      dispatch({ type: 'loaded', info: res.chat, messages: res.messages });
      const key = ck(res.chat.type, res.chat.pin);
      setActiveKey(key);
      markRead(key);
      resolve(true);
    });
  });

  const active = activeKey ? chats[activeKey] : null;
  const chatsRef = useRef(chats); chatsRef.current = chats;
  const getChat = useCallback(() => (activeRef.current ? chatsRef.current[activeRef.current] : null), []);

  const rec = useRecorder({ getChat, upload, emitMsg, toast });

  const sendText = (text) => {
    if (!active) return;
    socketRef.current.emit('msg:send', { to: active.pin, kind: 'text', text }, (res) => { if (res && res.error) toast(res.error); });
  };

  const sendFiles = async (files) => {
    if (!active) return;
    for (const f of files) {
      try {
        const meta = await upload(f);
        await emitMsg({ to: active.pin, kind: 'file', file: meta });
      } catch (ex) { toast(ex.message); }
    }
  };

  /* ---------------------------- effects --------------------------- */
  const list = Object.values(chats);
  const totalUnread = list.reduce((n, c) => n + c.unread, 0);
  useEffect(() => { document.title = (totalUnread ? '(' + totalUnread + ') ' : '') + 'Huddle'; }, [totalUnread]);

  useEffect(() => {
    const vis = () => { if (!document.hidden && activeRef.current) markRead(activeRef.current); };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, [markRead]);

  const typers = active ? Object.values(typing[active.key] || {}) : [];

  return (
    <>
      <div id="app" className={activeKey ? 'chat-open' : ''}>
        <Sidebar
          me={me} chats={list} activeKey={activeKey} online={online} voice={voice} conn={conn}
          onSelect={selectChat} onOpenPin={openByPin} onSignOut={onSignOut}
        />
        <section className="main">
          {active ? (
            <ChatPane
              chat={active} mePin={me.pin} online={online} typers={typers} voice={voice} sid={sid}
              socketRef={socketRef} progress={progress} rec={rec}
              onBack={() => setActiveKey(null)} onSendText={sendText} onSendFiles={sendFiles}
            />
          ) : (
            <div id="empty" className="empty">
              <div className="empty-art" aria-hidden="true"><span /><span /><span /><span /></div>
              <h2>Pick a chat or type a PIN</h2>
              <p>A friend's PIN opens a private chat. The group PIN opens the class group and its voice lounge.</p>
            </div>
          )}
        </section>
      </div>
      <div id="voice-audio" hidden />
    </>
  );
}
