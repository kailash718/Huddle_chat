/* Huddle client */
(() => {
  'use strict';

  /* ------------------------------ Helpers ------------------------------ */
  const $ = (s, r = document) => r.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const icon = (id) => {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', 'i');
    const u = document.createElementNS(NS, 'use');
    u.setAttribute('href', '#i-' + id);
    s.appendChild(u);
    return s;
  };
  const setIcon = (btn, id) => { const old = btn.querySelector('svg'); if (old) old.replaceWith(icon(id)); };

  const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fmtSize = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
  const fmtDur = (s) => { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const dayLabel = (ts) => {
    const d = new Date(ts), t = new Date(), y = new Date();
    y.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() !== t.getFullYear() ? 'numeric' : undefined });
  };
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const hueOf = (pin) => (parseInt(pin, 10) * 47) % 360;
  const digitsOnly = (input) => input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); });

  function toast(msg) {
    const t = el('div', 'toast', msg);
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3700);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* fallback below */ }
    const ta = el('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
    ta.remove();
    return ok;
  }

  async function api(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again.');
    return j;
  }

  /* ------------------------------ State ------------------------------- */
  const KEY = 'huddle.me';
  let me = null;
  try { me = JSON.parse(localStorage.getItem(KEY)); } catch (_) { me = null; }
  let socket = null;
  let config = { httpsPort: null, maxFileMb: 50 };
  const chats = new Map();          // 'group:6767' | 'dm:1234' -> chat
  const onlineSet = new Set();
  const typingBy = new Map();       // chatKey -> Map(pin -> {name, timer})
  let activeKey = null;

  const ck = (type, pin) => type + ':' + pin;
  const active = () => chats.get(activeKey) || null;

  function upsertChat(info) {
    const key = ck(info.type, info.pin);
    let c = chats.get(key);
    if (!c) {
      c = { key, type: info.type, pin: info.pin, name: info.name, messages: [], loaded: false, unread: 0, last: null, members: [], voice: [] };
      chats.set(key, c);
    }
    applyInfo(c, info);
    return c;
  }
  function applyInfo(c, i) {
    if (i.name) c.name = i.name;
    if (i.last !== undefined) c.last = i.last;
    if (i.members) c.members = i.members;
    if (i.voice) c.voice = i.voice;
  }

  /* ------------------------------ Avatars ----------------------------- */
  function makeAvatar(name, pin, type, large) {
    const a = el('span', 'avatar' + (type === 'group' ? ' group' : '') + (large ? ' lg' : ''));
    a.style.setProperty('--h', hueOf(pin));
    if (type === 'group') a.appendChild(icon('hash'));
    else a.textContent = ((name || '?').trim().charAt(0) || '?').toUpperCase();
    return a;
  }

  /* ------------------------------ Auth UI ----------------------------- */
  function showAuth() {
    $('#auth').hidden = false; $('#reveal').hidden = true; $('#app').hidden = true;
  }
  function switchTab(toNew) {
    $('#tab-new').classList.toggle('active', toNew);
    $('#tab-back').classList.toggle('active', !toNew);
    $('#tab-new').setAttribute('aria-selected', toNew);
    $('#tab-back').setAttribute('aria-selected', !toNew);
    $('#form-new').hidden = !toNew;
    $('#form-back').hidden = toNew;
  }
  $('#tab-new').onclick = () => switchTab(true);
  $('#tab-back').onclick = () => switchTab(false);
  digitsOnly($('#reg-pin')); digitsOnly($('#log-pin')); digitsOnly($('#go-pin'));

  $('#form-new').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#err-new'); err.textContent = '';
    const pin = $('#reg-pin').value.trim();
    if (pin && pin.length !== 4) { err.textContent = 'A PIN is exactly 4 digits.'; return; }
    try {
      me = await api('/api/register', { name: $('#reg-name').value, pin });
      localStorage.setItem(KEY, JSON.stringify(me));
      showReveal();
    } catch (ex) { err.textContent = ex.message; }
  });
  $('#form-back').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#err-back'); err.textContent = '';
    try {
      me = await api('/api/login', { pin: $('#log-pin').value, name: $('#log-name').value });
      localStorage.setItem(KEY, JSON.stringify(me));
      boot();
    } catch (ex) { err.textContent = ex.message; }
  });

  function showReveal() {
    $('#auth').hidden = true; $('#reveal').hidden = false;
    const box = $('#reveal-tiles'); box.textContent = '';
    [...me.pin].forEach((d, i) => { const t = el('div', 'tile', d); t.style.setProperty('--i', i); box.appendChild(t); });
  }
  $('#reveal-copy').onclick = async () => toast((await copyText(me.pin)) ? 'PIN copied' : 'Could not copy. Your PIN is ' + me.pin);
  $('#reveal-go').onclick = () => boot();

  /* ------------------------------ Socket ------------------------------ */
  function boot() {
    $('#auth').hidden = true; $('#reveal').hidden = true;
    showApp();
    renderList();
    connect();
  }

  function setConn(ok, text) {
    const c = $('#conn');
    c.className = 'conn ' + (ok ? 'ok' : 'bad');
    c.lastElementChild.textContent = text;
  }

  function connect() {
    socket = io({ auth: { pin: me.pin, token: me.token }, reconnectionDelayMax: 3000 });

    socket.on('connect_error', (err) => {
      if (err && err.message === 'auth') {
        localStorage.removeItem(KEY);
        me = null;
        socket.close();
        showAuth();
        toast('Please sign in again.');
      } else setConn(false, 'Reconnecting');
    });
    socket.on('connect', () => setConn(true, 'Connected'));
    socket.on('disconnect', () => { setConn(false, 'Reconnecting'); leaveVoice(true); });

    socket.on('init', (d) => {
      onlineSet.clear();
      d.online.forEach((p) => onlineSet.add(p));
      d.chats.forEach((info) => {
        const c = upsertChat(info);
        c.unread = info.unread;
        c.loaded = false;
      });
      showApp();
      renderList();
      const a = active();
      if (a) { a.unread = 0; loadChat(a); renderLounge(); }
    });

    socket.on('msg:new', ({ chat, message }) => {
      const c = upsertChat(chat);
      if (c.messages.some((m) => m.id === message.id)) return;
      c.messages.push(message);
      if (c.messages.length > 500) c.messages.shift();
      c.last = message;
      const mine = message.from === me.pin;
      if (activeKey === c.key) {
        appendMessage(c, message);
        if (!mine) { if (document.hidden) c.unread++; else markRead(c); }
      } else if (!mine) c.unread++;
      renderList();
    });

    socket.on('typing', (d) => {
      const key = ck(d.type, d.chat);
      let m = typingBy.get(key);
      if (!m) { m = new Map(); typingBy.set(key, m); }
      const prev = m.get(d.from);
      if (prev) clearTimeout(prev.timer);
      if (d.on) {
        m.set(d.from, { name: d.name, timer: setTimeout(() => { m.delete(d.from); renderHeader(); }, 3500) });
      } else m.delete(d.from);
      if (activeKey === key) renderHeader();
    });

    socket.on('presence', ({ pin, online }) => {
      if (online) onlineSet.add(pin); else onlineSet.delete(pin);
      renderList(); renderHeader();
    });

    socket.on('chat:read', ({ pin }) => {
      const c = chats.get(ck('group', pin)) || chats.get(ck('dm', pin));
      if (c) { c.unread = 0; renderList(); }
    });

    socket.on('group:members', ({ pin, members }) => {
      const c = chats.get(ck('group', pin));
      if (c) { c.members = members; renderHeader(); }
    });

    socket.on('voice:state', ({ group, participants }) => {
      const c = chats.get(ck('group', group));
      if (c) c.voice = participants;
      if (voice.group === group) {
        for (const sid of [...voice.peers.keys()]) {
          if (!participants.some((p) => p.sid === sid)) closePeer(sid);
        }
      }
      renderLounge(); renderList(); renderDock();
    });
    socket.on('voice:signal', onSignal);
  }

  function showApp() {
    $('#app').hidden = false;
    $('#me-name').textContent = me.name;
    $('#me-pin').textContent = me.pin;
    const holder = $('#me-avatar');
    holder.replaceChildren(makeAvatar(me.name, me.pin, 'dm'));
  }

  /* ------------------------------ Chat list --------------------------- */
  function previewText(c) {
    const m = c.last;
    if (!m) return 'No messages yet';
    let body = m.text;
    if (m.kind === 'audio') body = 'Voice message';
    else if (m.kind === 'file') body = isImage(m.file) ? 'Photo' : m.file.name;
    let who = '';
    if (m.from === me.pin) who = 'You: ';
    else if (c.type === 'group') who = (m.fromName || '').split(' ')[0] + ': ';
    return who + body;
  }

  function renderList() {
    const list = $('#chat-list');
    list.textContent = '';
    const arr = [...chats.values()].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'group' ? -1 : 1;
      return (b.last ? b.last.ts : 0) - (a.last ? a.last.ts : 0);
    });
    if (!arr.length) { list.appendChild(el('p', 'list-empty', 'No chats yet. Type a PIN above to start one.')); }
    let totalUnread = 0;
    arr.forEach((c) => {
      totalUnread += c.unread;
      const b = el('button', 'chat-item' + (c.key === activeKey ? ' active' : ''));
      b.type = 'button';
      const av = makeAvatar(c.name, c.pin, c.type);
      if (c.type === 'dm' && onlineSet.has(c.pin)) av.classList.add('on');
      const top = el('span', 'ci-top');
      top.append(el('b', null, c.name), el('time', null, c.last ? fmtTime(c.last.ts) : ''));
      const bot = el('span', 'ci-bot');
      bot.appendChild(el('span', 'ci-prev', previewText(c)));
      if (c.type === 'group' && c.voice && c.voice.length) {
        const lv = el('span', 'live'); lv.append(icon('headphones'), document.createTextNode(String(c.voice.length)));
        lv.title = c.voice.length + ' in voice';
        bot.appendChild(lv);
      } else if (c.unread) bot.appendChild(el('span', 'badge', c.unread > 99 ? '99+' : String(c.unread)));
      const mid = el('span', 'ci-mid'); mid.append(top, bot);
      b.append(av, mid);
      b.onclick = () => selectChat(c.key);
      list.appendChild(b);
    });
    document.title = (totalUnread ? '(' + totalUnread + ') ' : '') + 'Huddle';
  }

  $('#go-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#go-pin');
    const pin = input.value.trim();
    if (!/^\d{4}$/.test(pin)) return toast('A PIN is exactly 4 digits.');
    socket.emit('chat:open', { pin }, (res) => {
      if (!res || res.error) return toast(res ? res.error : 'No answer from the server');
      const c = upsertChat(res.chat);
      c.messages = res.messages; c.loaded = true;
      input.value = '';
      selectChat(c.key);
    });
  });

  $('#me-card').onclick = async () => toast((await copyText(me.pin)) ? 'Your PIN ' + me.pin + ' is copied' : 'Your PIN is ' + me.pin);
  $('#signout').onclick = () => {
    if (!confirm('Sign out? You can sign back in later with your PIN and name.')) return;
    leaveVoice();
    localStorage.removeItem(KEY);
    location.reload();
  };

  /* ------------------------------ Chat view --------------------------- */
  function selectChat(key) {
    const c = chats.get(key);
    if (!c) return;
    activeKey = key;
    $('#app').classList.add('chat-open');
    $('#empty').hidden = true; $('#chat').hidden = false;
    closeEmoji();
    renderHeader(); renderLounge(); renderMessages(); renderList();
    if (!c.loaded) loadChat(c);
    markRead(c);
    if (window.matchMedia('(hover: hover)').matches) $('#text').focus();
  }

  function loadChat(c) {
    socket.emit('chat:open', { pin: c.pin }, (res) => {
      if (!res || res.error) return toast(res ? res.error : 'Could not load this chat');
      applyInfo(c, res.chat);
      c.messages = res.messages; c.loaded = true;
      if (activeKey === c.key) { renderHeader(); renderLounge(); renderMessages(); }
      renderList();
    });
  }

  function markRead(c) {
    c.unread = 0;
    socket.emit('chat:read', { pin: c.pin });
    renderList();
  }
  document.addEventListener('visibilitychange', () => { const c = active(); if (!document.hidden && c) markRead(c); });

  $('#back').onclick = () => {
    $('#app').classList.remove('chat-open');
    activeKey = null;
    $('#chat').hidden = true; $('#empty').hidden = false;
    renderList();
  };

  function renderHeader() {
    const c = active();
    if (!c) return;
    $('#ch-avatar').replaceChildren(makeAvatar(c.name, c.pin, c.type));
    $('#ch-name').textContent = c.name;
    const s = $('#ch-status');
    const typers = [...(typingBy.get(c.key) || new Map()).values()].map((t) => t.name);
    let text, hot = false;
    if (typers.length) { text = (c.type === 'dm' ? 'typing...' : typers.slice(0, 2).join(' and ') + ' typing...'); hot = true; }
    else if (c.type === 'dm') { hot = onlineSet.has(c.pin); text = hot ? 'Online' : 'Offline'; }
    else {
      const on = c.members.filter((p) => onlineSet.has(p)).length;
      text = c.members.length + ' members, ' + on + ' online';
      hot = on > 1;
    }
    s.textContent = text; s.className = hot ? 'hot' : '';
  }

  /* ------------------------------ Messages ---------------------------- */
  const msgsBox = $('#msgs');
  const nearBottom = () => msgsBox.scrollHeight - msgsBox.scrollTop - msgsBox.clientHeight < 120;
  const toBottom = (smooth) => { msgsBox.style.scrollBehavior = smooth ? 'smooth' : 'auto'; msgsBox.scrollTop = msgsBox.scrollHeight; };

  function renderMessages() {
    const c = active();
    msgsBox.textContent = '';
    if (!c) return;
    if (!c.messages.length) {
      msgsBox.appendChild(el('div', 'hello', c.loaded
        ? (c.type === 'group' ? 'This is the start of the ' + c.name + '. Say hi.' : 'Say hi to ' + c.name + '. Only you two can see this chat.')
        : 'Loading messages...'));
      return;
    }
    c.messages.forEach((m, i) => renderOne(c, m, c.messages[i - 1]));
    toBottom(false);
  }

  function appendMessage(c, m) {
    const hello = msgsBox.querySelector('.hello');
    if (hello) hello.remove();
    const stick = nearBottom() || m.from === me.pin;
    const idx = c.messages.indexOf(m);
    renderOne(c, m, c.messages[idx - 1], () => { if (stick) toBottom(false); });
    if (stick) toBottom(true);
  }

  const isImage = (f) => !!f && (/^image\/(png|jpe?g|gif|webp)$/i.test(f.mime || '') || /\.(png|jpe?g|gif|webp)$/i.test(f.name || ''));

  function renderOne(c, m, prev, onMedia) {
    if (!prev || !sameDay(prev.ts, m.ts)) msgsBox.appendChild(el('div', 'day', dayLabel(m.ts)));
    const mine = m.from === me.pin;
    const cont = prev && sameDay(prev.ts, m.ts) && prev.from === m.from && m.ts - prev.ts < 5 * 60 * 1000;
    const row = el('div', 'msg ' + (mine ? 'mine' : 'theirs') + (cont ? ' cont' : ''));
    const bub = el('div', 'bubble');
    bub.style.setProperty('--h', hueOf(m.from));
    if (c.type === 'group' && !mine && !cont) bub.appendChild(el('span', 'from', m.fromName));

    if (m.kind === 'text') {
      bub.appendChild(linkify(m.text));
      if (/^(?:\p{Extended_Pictographic}|\u200d|\ufe0f|\s){1,6}$/u.test(m.text)) bub.classList.add('big');
    } else if (m.kind === 'audio') {
      bub.appendChild(audioPlayer(m));
    } else if (m.kind === 'file' && m.file) {
      if (isImage(m.file)) {
        const a = el('a', 'pic'); a.href = m.file.url; a.target = '_blank'; a.rel = 'noopener';
        const img = el('img'); img.src = m.file.url; img.alt = m.file.name; img.loading = 'lazy';
        if (onMedia) img.addEventListener('load', onMedia);
        a.appendChild(img); bub.appendChild(a);
      } else bub.appendChild(fileCard(m.file));
    }
    bub.appendChild(el('span', 'meta', fmtTime(m.ts)));
    row.appendChild(bub);
    msgsBox.appendChild(row);
  }

  function linkify(text) {
    const frag = document.createDocumentFragment();
    text.split(/(https?:\/\/[^\s<]+)/g).forEach((part, i) => {
      if (i % 2) { const a = el('a', null, part); a.href = part; a.target = '_blank'; a.rel = 'noopener noreferrer'; frag.appendChild(a); }
      else if (part) frag.appendChild(document.createTextNode(part));
    });
    return frag;
  }

  function fileCard(f) {
    const a = el('a', 'file');
    a.href = f.url; a.setAttribute('download', f.name); a.rel = 'noopener';
    const ext = ((f.name.includes('.') ? f.name.split('.').pop() : 'file') || 'file').slice(0, 4).toUpperCase();
    const info = el('span', 'file-info');
    info.append(el('b', null, f.name), el('small', null, fmtSize(f.size)));
    a.append(el('span', 'file-ic', ext), info, icon('download'));
    return a;
  }

  let playingAudio = null;
  function audioPlayer(m) {
    const wrap = el('div', 'audio');
    const btn = el('button', 'ap-btn'); btn.type = 'button'; btn.setAttribute('aria-label', 'Play voice message');
    btn.appendChild(icon('play'));
    const bars = el('div', 'ap-bars');
    const N = 30, spans = [];
    let seed = parseInt(m.id.slice(0, 6), 16) || 7;
    for (let i = 0; i < N; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const b = el('i'); b.style.height = 22 + (seed % 68) + '%';
      bars.appendChild(b); spans.push(b);
    }
    const time = el('span', 'ap-time', fmtDur(m.dur));
    const audio = new Audio(); audio.preload = 'none'; audio.src = m.file.url;
    const total = () => m.dur || (isFinite(audio.duration) ? audio.duration : 0);
    const paint = (f) => { const n = Math.round(f * N); spans.forEach((s, i) => s.classList.toggle('on', i < n)); };
    btn.onclick = () => {
      if (audio.paused) {
        if (playingAudio && playingAudio !== audio) playingAudio.pause();
        playingAudio = audio;
        audio.play().catch(() => toast('This browser cannot play that voice message.'));
      } else audio.pause();
    };
    audio.onplay = () => setIcon(btn, 'pause');
    audio.onpause = () => setIcon(btn, 'play');
    audio.ontimeupdate = () => { const t = total(); paint(t ? Math.min(audio.currentTime / t, 1) : 0); time.textContent = fmtDur(audio.currentTime); };
    audio.onended = () => { paint(0); time.textContent = fmtDur(total()); setIcon(btn, 'play'); };
    wrap.append(btn, bars, time);
    return wrap;
  }

  /* ------------------------------ Composer ---------------------------- */
  const ta = $('#text');
  const autosize = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; };
  function syncSendMic() {
    const has = ta.value.trim().length > 0;
    $('#btn-send').hidden = !has; $('#btn-mic').hidden = has;
  }
  let typingSentAt = 0, typingOff = null;
  ta.addEventListener('input', () => {
    autosize(); syncSendMic();
    const c = active(); if (!c) return;
    const now = Date.now();
    if (now - typingSentAt > 2000) { socket.emit('typing', { to: c.pin, on: true }); typingSentAt = now; }
    clearTimeout(typingOff);
    typingOff = setTimeout(() => { socket.emit('typing', { to: c.pin, on: false }); typingSentAt = 0; }, 2500);
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendText(); }
  });
  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); sendText(); });

  function sendText() {
    const c = active();
    const text = ta.value.trim();
    if (!c || !text) return;
    socket.emit('msg:send', { to: c.pin, kind: 'text', text }, (res) => { if (res && res.error) toast(res.error); });
    ta.value = ''; autosize(); syncSendMic();
    clearTimeout(typingOff); typingSentAt = 0;
    socket.emit('typing', { to: c.pin, on: false });
  }

  /* Emoji */
  const EMOJI = '😀 😂 🥹 😍 😎 🤔 😅 😭 🙏 👍 👎 👏 🙌 🔥 ✨ 💯 ❤️ 💜 🎉 🥳 😴 🤯 😤 🫡 👀 💀 ☕ 📚 💻 🧠 ✅ ❌ 🍕 🎧 🚀 😇 🤝 🫶 🙈 🤣 😉 😊 🥲 😬 🤞 💪 🎯'.split(' ');
  const pop = $('#emoji');
  EMOJI.forEach((e) => {
    const b = el('button', null, e); b.type = 'button';
    b.onclick = () => {
      const s = ta.selectionStart, en = ta.selectionEnd;
      ta.value = ta.value.slice(0, s) + e + ta.value.slice(en);
      ta.selectionStart = ta.selectionEnd = s + e.length;
      autosize(); syncSendMic(); ta.focus();
    };
    pop.appendChild(b);
  });
  const closeEmoji = () => { pop.hidden = true; };
  $('#btn-emoji').onclick = (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; };
  document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target)) closeEmoji(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEmoji(); });

  /* Files */
  $('#btn-attach').onclick = () => $('#file-input').click();
  $('#file-input').onchange = (e) => { sendFiles([...e.target.files]); e.target.value = ''; };
  const chatEl = $('#chat');
  let dragDepth = 0;
  chatEl.addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; $('#drop').hidden = false; } });
  chatEl.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#drop').hidden = true; });
  chatEl.addEventListener('dragover', (e) => e.preventDefault());
  chatEl.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; $('#drop').hidden = true; if (e.dataTransfer.files.length) sendFiles([...e.dataTransfer.files]); });

  function upload(file, label) {
    return new Promise((resolve, reject) => {
      if (file.size > config.maxFileMb * 1048576) return reject(new Error((label || file.name) + ' is bigger than ' + config.maxFileMb + ' MB.'));
      const strip = $('#upload-strip'), bar = $('#up-bar');
      $('#up-label').textContent = 'Sending ' + (label || file.name);
      bar.style.width = '0%'; strip.hidden = false;
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');
      xhr.setRequestHeader('x-pin', me.pin); xhr.setRequestHeader('x-token', me.token);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) bar.style.width = Math.round((e.loaded / e.total) * 100) + '%'; };
      xhr.onload = () => {
        strip.hidden = true;
        let j = {}; try { j = JSON.parse(xhr.responseText); } catch (_) { /* ignore */ }
        if (xhr.status === 200) resolve(j); else reject(new Error(j.error || 'Upload failed'));
      };
      xhr.onerror = () => { strip.hidden = true; reject(new Error('Upload failed. Check your connection.')); };
      const fd = new FormData(); fd.append('file', file, file.name);
      xhr.send(fd);
    });
  }

  function emitMsg(payload) {
    return new Promise((resolve) => socket.emit('msg:send', payload, (res) => { if (res && res.error) toast(res.error); resolve(); }));
  }

  async function sendFiles(files) {
    const c = active();
    if (!c) return;
    for (const f of files) {
      try {
        const meta = await upload(f);
        await emitMsg({ to: c.pin, kind: 'file', file: meta });
      } catch (ex) { toast(ex.message); }
    }
  }

  /* Voice notes */
  const rec = { mr: null, stream: null, chunks: [], t0: 0, timer: null, cancel: false, chat: null };
  const secureOK = () => window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

  async function startRec() {
    if (rec.mr) return;
    if (!secureOK() || !window.MediaRecorder) { toast('Voice messages need the secure link (https). Ask the host for it.'); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (_) { toast('Microphone is blocked. Allow it in the address bar and try again.'); return; }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    Object.assign(rec, { mr, stream, chunks: [], t0: Date.now(), cancel: false, chat: active() });
    mr.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(rec.timer);
      const secs = (Date.now() - rec.t0) / 1000;
      const type = mr.mimeType || mime || 'audio/webm';
      const c = rec.chat;
      rec.mr = null;
      showRec(false);
      if (rec.cancel) return;
      if (secs < 0.8) { toast('That was too short. Hold on a little longer.'); return; }
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([new Blob(rec.chunks, { type })], 'voice-message.' + ext, { type });
      try {
        const meta = await upload(file, 'voice message');
        await emitMsg({ to: c.pin, kind: 'audio', file: meta, dur: Math.round(secs) });
      } catch (ex) { toast(ex.message); }
    };
    mr.start(250);
    showRec(true);
    rec.timer = setInterval(() => {
      const s = (Date.now() - rec.t0) / 1000;
      $('#rec-time').textContent = fmtDur(s);
      if (s > 300) stopRec(false);
    }, 250);
  }
  function stopRec(cancel) {
    if (!rec.mr || rec.mr.state === 'inactive') return;
    rec.cancel = !!cancel;
    rec.mr.stop();
  }
  function showRec(on) {
    $('#rec-bar').hidden = !on; $('#composer').hidden = on;
    if (on) $('#rec-time').textContent = '0:00';
  }
  $('#btn-mic').onclick = startRec;
  $('#rec-cancel').onclick = () => stopRec(true);
  $('#rec-send').onclick = () => stopRec(false);

  /* ------------------------------ Voice lounge ------------------------ */
  const voice = { group: null, stream: null, peers: new Map(), muted: false, ctx: null, meters: new Map() };
  const rtcConfig = { iceServers: [] };   // same network: no STUN/TURN needed

  function renderLounge() {
    const c = active();
    const L = $('#lounge');
    if (!c || c.type !== 'group') { L.hidden = true; return; }
    L.hidden = false;
    const parts = c.voice || [];
    const inCall = voice.group === c.pin;
    $('#lounge-sub').textContent = parts.length ? parts.length + (parts.length === 1 ? ' person is in the call' : ' people are in the call') : 'Nobody is talking yet';
    $('#v-join').hidden = inCall;
    $('#v-mute').hidden = !inCall; $('#v-leave').hidden = !inCall;
    if (inCall) {
      setIcon($('#v-mute'), voice.muted ? 'mic-off' : 'mic');
      $('#v-mute span').textContent = voice.muted ? 'Unmute' : 'Mute';
    }
    const box = $('#orbs');
    box.textContent = '';
    parts.forEach((p) => {
      const o = el('div', 'orb'); o.dataset.sid = p.sid;
      const av = makeAvatar(p.name, p.pin, 'dm', true);
      if (p.muted) { const b = el('span', 'muted-badge'); b.appendChild(icon('mic-off')); av.appendChild(b); }
      const you = p.sid === (socket && socket.id);
      o.append(av, el('span', 'orb-name', you ? 'You' : p.name));
      const m = voice.meters.get(p.sid);
      if (m) { o.style.setProperty('--lvl', m.lvl.toFixed(2)); o.classList.toggle('talking', m.speaking); }
      box.appendChild(o);
    });
  }

  function renderDock() {
    const d = $('#dock');
    d.hidden = !voice.group;
    if (!voice.group) return;
    const c = chats.get(ck('group', voice.group));
    $('#dock-name').textContent = c ? c.name : 'Group';
    setIcon($('#dock-mute'), voice.muted ? 'mic-off' : 'mic');
  }

  async function joinVoice(group) {
    if (voice.group) return;
    if (!secureOK()) { toast('Voice calls need the secure link (https). Ask the host for it.'); return; }
    try {
      voice.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (_) { toast('Microphone is blocked. Allow it in the address bar and try again.'); return; }
    voice.ctx = voice.ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (voice.ctx.state === 'suspended') voice.ctx.resume();
    socket.emit('voice:join', { group }, (res) => {
      if (!res || res.error) { stopLocalVoice(); toast(res ? res.error : 'Could not join voice'); return; }
      voice.group = group; voice.muted = false;
      addMeter(socket.id, voice.stream);
      res.peers.forEach((p) => connectPeer(p.sid, true));
      renderLounge(); renderDock();
    });
  }

  function stopLocalVoice() {
    if (voice.stream) voice.stream.getTracks().forEach((t) => t.stop());
    voice.stream = null;
  }

  function leaveVoice(silent) {
    if (!voice.group && !voice.stream) return;
    for (const sid of [...voice.peers.keys()]) closePeer(sid);
    stopLocalVoice();
    voice.meters.clear();
    voice.group = null; voice.muted = false;
    if (!silent && socket) socket.emit('voice:leave');
    renderLounge(); renderDock();
  }

  function setMuted(m) {
    if (!voice.group) return;
    voice.muted = m;
    voice.stream.getAudioTracks().forEach((t) => { t.enabled = !m; });
    socket.emit('voice:mute', { muted: m });
    renderLounge(); renderDock();
  }

  function connectPeer(sid, initiator) {
    const pc = new RTCPeerConnection(rtcConfig);
    const peer = { sid, pc, pending: [], audio: null };
    voice.peers.set(sid, peer);
    voice.stream.getTracks().forEach((t) => pc.addTrack(t, voice.stream));
    pc.onicecandidate = (e) => { if (e.candidate) socket.emit('voice:signal', { to: sid, data: { candidate: e.candidate } }); };
    pc.ontrack = (e) => {
      if (peer.audio) return;
      const a = document.createElement('audio');
      a.autoplay = true; a.setAttribute('playsinline', '');
      a.srcObject = e.streams[0];
      $('#voice-audio').appendChild(a);
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
        .then(() => socket.emit('voice:signal', { to: sid, data: { sdp: pc.localDescription } }))
        .catch(() => {});
    }
    return peer;
  }

  async function onSignal({ from, data }) {
    if (!voice.group || !voice.stream || !data) return;
    let peer = voice.peers.get(from);
    try {
      if (data.sdp) {
        if (data.sdp.type === 'offer') {
          if (!peer) peer = connectPeer(from, false);
          await peer.pc.setRemoteDescription(data.sdp);
          await flushPending(peer);
          const ans = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(ans);
          socket.emit('voice:signal', { to: from, data: { sdp: peer.pc.localDescription } });
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
  async function flushPending(peer) {
    while (peer.pending.length) { try { await peer.pc.addIceCandidate(peer.pending.shift()); } catch (_) { /* ignore */ } }
  }

  function closePeer(sid) {
    const p = voice.peers.get(sid);
    if (!p) return;
    try { p.pc.close(); } catch (_) { /* ignore */ }
    if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
    voice.peers.delete(sid);
    voice.meters.delete(sid);
  }

  /* Speaking rings: level meters on every stream */
  function addMeter(id, stream) {
    if (!voice.ctx) return;
    try {
      const src = voice.ctx.createMediaStreamSource(stream);
      const an = voice.ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      voice.meters.set(id, { an, buf: new Uint8Array(an.fftSize), lvl: 0, speaking: false });
    } catch (_) { /* ignore */ }
  }
  setInterval(() => {
    if (!voice.meters.size) return;
    const orbs = $('#orbs');
    voice.meters.forEach((m, id) => {
      m.an.getByteTimeDomainData(m.buf);
      let sum = 0;
      for (let i = 0; i < m.buf.length; i++) { const x = (m.buf[i] - 128) / 128; sum += x * x; }
      let lvl = Math.min(1, Math.sqrt(sum / m.buf.length) * 7);
      if (id === socket.id && voice.muted) lvl = 0;
      m.lvl = m.lvl * 0.45 + lvl * 0.55;
      m.speaking = m.lvl > 0.14;
      const o = orbs.querySelector('[data-sid="' + id + '"]');
      if (o) { o.style.setProperty('--lvl', m.lvl.toFixed(2)); o.classList.toggle('talking', m.speaking); }
    });
  }, 100);

  $('#v-join').onclick = () => { const c = active(); if (c && c.type === 'group') joinVoice(c.pin); };
  $('#v-leave').onclick = () => leaveVoice();
  $('#v-mute').onclick = () => setMuted(!voice.muted);
  $('#dock-leave').onclick = () => leaveVoice();
  $('#dock-mute').onclick = () => setMuted(!voice.muted);
  window.addEventListener('pagehide', () => { if (voice.group) socket.emit('voice:leave'); });

  /* ------------------------------ Start ------------------------------- */
  fetch('/api/config').then((r) => r.json()).then((c) => {
    config = c;
    if (!window.isSecureContext && c.httpsPort) {
      const bar = $('#secure-bar');
      $('#secure-link').href = 'https://' + location.hostname + ':' + c.httpsPort;
      bar.hidden = false;
      document.body.classList.add('has-bar');
    }
  }).catch(() => {});

  if (me && me.pin && me.token) boot(); else showAuth();
})();
