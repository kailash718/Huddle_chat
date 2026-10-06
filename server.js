/* Huddle - class chat for the college network
 * Chat by 4-digit PIN, group chat, files, voice notes, group voice calls.
 * Run:  npm install   then   node server.js
 */
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const multer = require('multer');
const selfsigned = require('selfsigned');
const { Server } = require('socket.io');

/* ------------------------------ CONFIG ------------------------------ */
const HTTP_PORT = Number(process.env.PORT) || 3000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
// Group chats: PIN -> name. Add more lines here if you want more groups.
const GROUPS = { '6767': 'Class Group' };
const MAX_FILE_MB = 50;      // biggest file a person can share
const HISTORY_LIMIT = 500;   // messages kept per chat
/* -------------------------------------------------------------------- */

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const CERT_DIR = path.join(DATA_DIR, 'cert');
[DATA_DIR, UPLOAD_DIR, CERT_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

/* ------------------------------ Storage ----------------------------- */
const DB_FILE = path.join(DATA_DIR, 'db.json');
let db = { users: {}, messages: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (_) { /* first run */ }
db.users = db.users || {};
db.messages = db.messages || {};

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DB_FILE + '.tmp', JSON.stringify(db), (err) => {
      if (!err) fs.rename(DB_FILE + '.tmp', DB_FILE, () => {});
    });
  }, 400);
}
function saveNow() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch (_) { /* ignore */ }
}

/* ------------------------------ Helpers ----------------------------- */
const isPin = (p) => /^\d{4}$/.test(String(p));
const dmKey = (a, b) => 'dm:' + [a, b].sort().join('-');
const gKey = (p) => 'g:' + p;
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n);

function randomPin() {
  for (let i = 0; i < 5000; i++) {
    const p = String(Math.floor(1000 + Math.random() * 9000));
    if (!db.users[p] && !GROUPS[p]) return p;
  }
  return null;
}

function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

/* Self-signed HTTPS certificate (so browsers allow the microphone on the LAN) */
function getCert(ips) {
  const keyF = path.join(CERT_DIR, 'key.pem');
  const certF = path.join(CERT_DIR, 'cert.pem');
  const metaF = path.join(CERT_DIR, 'meta.json');
  const want = ips.join(',');
  try {
    const meta = JSON.parse(fs.readFileSync(metaF, 'utf8'));
    if (meta.ips === want) return { key: fs.readFileSync(keyF), cert: fs.readFileSync(certF) };
  } catch (_) { /* make a new one */ }
  const altNames = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }]
    .concat(ips.map((ip) => ({ type: 7, ip })));
  const pems = selfsigned.generate([{ name: 'commonName', value: 'huddle.local' }], {
    days: 825, keySize: 2048, algorithm: 'sha256',
    extensions: [{ name: 'subjectAltName', altNames }]
  });
  fs.writeFileSync(keyF, pems.private);
  fs.writeFileSync(certF, pems.cert);
  fs.writeFileSync(metaF, JSON.stringify({ ips: want }));
  return { key: pems.private, cert: pems.cert };
}

/* ------------------------------ Express ----------------------------- */
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

app.get('/api/config', (req, res) => {
  res.json({ httpsPort: httpsServer ? HTTPS_PORT : null, maxFileMb: MAX_FILE_MB });
});

app.post('/api/register', (req, res) => {
  const name = clean(req.body && req.body.name, 24);
  let pin = clean(req.body && req.body.pin, 4);
  if (!name) return res.status(400).json({ error: 'Enter your name' });
  if (pin) {
    if (!isPin(pin)) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    if (GROUPS[pin] || db.users[pin]) return res.status(409).json({ error: 'That PIN is taken. Pick another one.' });
  } else {
    pin = randomPin();
    if (!pin) return res.status(500).json({ error: 'No PINs left' });
  }
  const token = crypto.randomBytes(16).toString('hex');
  db.users[pin] = { name, token, contacts: [], groups: [], lastRead: {}, created: Date.now() };
  save();
  res.json({ pin, name, token });
});

// Sign back in on a new browser or after clearing data: PIN + the name you registered with
app.post('/api/login', (req, res) => {
  const pin = clean(req.body && req.body.pin, 4);
  const name = clean(req.body && req.body.name, 24).toLowerCase();
  const u = db.users[pin];
  if (!u || u.name.toLowerCase() !== name) return res.status(401).json({ error: 'PIN and name do not match' });
  res.json({ pin, name: u.name, token: u.token });
});

const SAFE_INLINE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.webm', '.ogg', '.mp3', '.m4a', '.wav', '.aac']);
app.use('/uploads', express.static(UPLOAD_DIR, {
  index: false,
  setHeaders: (res, file) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!SAFE_INLINE.has(path.extname(file).toLowerCase())) res.setHeader('Content-Disposition', 'attachment');
  }
}));
// Serve the React build (client/dist). If it has not been built yet, fall back to the old plain frontend in /public.
const CLIENT_DIST = path.join(ROOT, 'client', 'dist');
const WEB_DIR = fs.existsSync(path.join(CLIENT_DIST, 'index.html')) ? CLIENT_DIST : path.join(ROOT, 'public');
app.use(express.static(WEB_DIR, { extensions: ['html'] }));

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
    cb(null, crypto.randomBytes(9).toString('hex') + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 } });

function authed(req, res, next) {
  const u = db.users[req.get('x-pin')];
  if (!u || u.token !== req.get('x-token')) return res.status(401).json({ error: 'Not signed in' });
  req.user = u;
  next();
}

app.post('/api/upload', authed, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `File too big (max ${MAX_FILE_MB} MB)` : 'Upload failed';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    let name = req.file.originalname || 'file';
    try { name = Buffer.from(name, 'latin1').toString('utf8'); } catch (_) { /* keep */ }
    res.json({ url: '/uploads/' + req.file.filename, name: clean(name, 120), size: req.file.size, mime: clean(req.file.mimetype, 80) });
  });
});

/* ------------------------------ Servers ----------------------------- */
const ips = lanIPs();
const httpServer = http.createServer(app);
let httpsServer = null;
try { httpsServer = https.createServer(getCert(ips), app); } catch (e) { console.log('HTTPS is off:', e.message); }

const io = new Server({ maxHttpBufferSize: 1e6, pingInterval: 10000, pingTimeout: 20000 });
io.attach(httpServer);
if (httpsServer) io.attach(httpsServer);

/* ------------------------------ Realtime ---------------------------- */
const online = new Map();  // pin -> number of open tabs
const voice = {};          // group pin -> Map(socket.id -> { pin, name, muted })

const voiceList = (g) => [...(voice[g] || new Map())].map(([sid, v]) => ({ sid, pin: v.pin, name: v.name, muted: v.muted }));
const broadcastVoice = (g) => io.to('g:' + g).emit('voice:state', { group: g, participants: voiceList(g) });
const groupMembers = (g) => Object.keys(db.users).filter((p) => db.users[p].groups.includes(g));
const tail = (key, n = 300) => (db.messages[key] || []).slice(-n);

function chatInfo(me, type, pin) {
  const key = type === 'group' ? gKey(pin) : dmKey(me, pin);
  const msgs = db.messages[key] || [];
  const readTs = db.users[me].lastRead[key] || 0;
  const info = {
    type, pin, key,
    name: type === 'group' ? GROUPS[pin] : db.users[pin].name,
    last: msgs[msgs.length - 1] || null,
    unread: msgs.filter((m) => m.ts > readTs && m.from !== me).length
  };
  if (type === 'group') { info.members = groupMembers(pin); info.voice = voiceList(pin); }
  return info;
}

function leaveVoice(socket) {
  const g = socket.data.voiceGroup;
  if (!g) return;
  if (voice[g]) voice[g].delete(socket.id);
  socket.data.voiceGroup = null;
  broadcastVoice(g);
}

io.use((socket, next) => {
  const auth = socket.handshake.auth || {};
  const u = db.users[auth.pin];
  if (!u || u.token !== auth.token) return next(new Error('auth'));
  socket.data.pin = auth.pin;
  next();
});

io.on('connection', (socket) => {
  const pin = socket.data.pin;
  const me = db.users[pin];

  socket.join('u:' + pin);
  me.groups.forEach((g) => socket.join('g:' + g));
  online.set(pin, (online.get(pin) || 0) + 1);
  if (online.get(pin) === 1) io.emit('presence', { pin, online: true });

  const chats = [
    ...me.groups.filter((g) => GROUPS[g]).map((g) => chatInfo(pin, 'group', g)),
    ...me.contacts.filter((c) => db.users[c]).map((c) => chatInfo(pin, 'dm', c))
  ];
  socket.emit('init', { me: { pin, name: me.name }, chats, online: [...online.keys()] });

  /* Open a chat by PIN (a person's 4-digit PIN or a group PIN) */
  socket.on('chat:open', (d, ack) => {
    if (typeof ack !== 'function') return;
    const target = clean(d && d.pin, 4);
    if (!isPin(target)) return ack({ error: 'Enter a 4-digit PIN' });

    if (GROUPS[target]) {
      if (!me.groups.includes(target)) {
        me.groups.push(target);
        save();
        io.in('u:' + pin).socketsJoin('g:' + target);
        io.to('g:' + target).emit('group:members', { pin: target, members: groupMembers(target) });
      }
      return ack({ ok: true, chat: chatInfo(pin, 'group', target), messages: tail(gKey(target)) });
    }
    if (target === pin) return ack({ error: 'That is your own PIN' });
    if (!db.users[target]) return ack({ error: 'Nobody has the PIN ' + target });
    if (!me.contacts.includes(target)) { me.contacts.push(target); save(); }
    ack({ ok: true, chat: chatInfo(pin, 'dm', target), messages: tail(dmKey(pin, target)) });
  });

  /* Send a message: text, file or voice note */
  socket.on('msg:send', (d, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    d = d || {};
    const to = clean(d.to, 4);
    const isGroup = !!GROUPS[to];
    if (isGroup && !me.groups.includes(to)) return ack({ error: 'Join the group first' });
    if (!isGroup && (!db.users[to] || to === pin)) return ack({ error: 'Person not found' });

    const kind = ['text', 'file', 'audio'].includes(d.kind) ? d.kind : 'text';
    let text = '';
    let file = null;
    if (kind === 'text') {
      text = String(d.text || '').replace(/\r\n/g, '\n').trim().slice(0, 4000);
      if (!text) return ack({ error: 'Type a message first' });
    } else {
      const f = d.file || {};
      if (!/^\/uploads\/[a-f0-9]{18}(\.[a-z0-9]{1,10})?$/.test(String(f.url || ''))) return ack({ error: 'Bad file' });
      file = { url: f.url, name: clean(f.name, 120) || 'file', size: Number(f.size) || 0, mime: clean(f.mime, 80) };
    }

    const key = isGroup ? gKey(to) : dmKey(pin, to);
    const message = {
      id: crypto.randomBytes(6).toString('hex'), key, from: pin, fromName: me.name, ts: Date.now(),
      kind, text, file, dur: Math.max(0, Math.min(Number(d.dur) || 0, 3600))
    };
    const list = (db.messages[key] = db.messages[key] || []);
    list.push(message);
    if (list.length > HISTORY_LIMIT) list.splice(0, list.length - HISTORY_LIMIT);

    if (isGroup) {
      io.to('g:' + to).emit('msg:new', { chat: { type: 'group', pin: to, key, name: GROUPS[to] }, message });
    } else {
      const other = db.users[to];
      if (!other.contacts.includes(pin)) other.contacts.push(pin);
      io.to('u:' + pin).emit('msg:new', { chat: { type: 'dm', pin: to, key, name: other.name }, message });
      io.to('u:' + to).emit('msg:new', { chat: { type: 'dm', pin, key, name: me.name }, message });
    }
    save();
    ack({ ok: true });
  });

  socket.on('typing', (d) => {
    const to = clean(d && d.to, 4);
    const payload = { from: pin, name: me.name, on: !!(d && d.on) };
    if (GROUPS[to]) socket.to('g:' + to).emit('typing', Object.assign({ chat: to, type: 'group' }, payload));
    else if (db.users[to]) io.to('u:' + to).emit('typing', Object.assign({ chat: pin, type: 'dm' }, payload));
  });

  socket.on('chat:read', (d) => {
    const cp = clean(d && d.pin, 4);
    const key = GROUPS[cp] ? gKey(cp) : (db.users[cp] ? dmKey(pin, cp) : null);
    if (!key) return;
    me.lastRead[key] = Date.now();
    save();
    io.to('u:' + pin).emit('chat:read', { pin: cp });
  });

  /* Voice: WebRTC signalling (audio itself goes directly between PCs) */
  socket.on('voice:join', (d, ack) => {
    if (typeof ack !== 'function') return;
    const g = clean(d && d.group, 4);
    if (!GROUPS[g] || !me.groups.includes(g)) return ack({ error: 'Join the group first' });
    leaveVoice(socket);
    const room = (voice[g] = voice[g] || new Map());
    const peers = [...room].map(([sid, v]) => ({ sid, pin: v.pin, name: v.name }));
    room.set(socket.id, { pin, name: me.name, muted: false });
    socket.data.voiceGroup = g;
    ack({ ok: true, peers });
    broadcastVoice(g);
  });
  socket.on('voice:signal', (d) => {
    const g = socket.data.voiceGroup;
    if (!g || !d) return;
    const target = io.sockets.sockets.get(d.to);
    if (target && target.data.voiceGroup === g) target.emit('voice:signal', { from: socket.id, data: d.data });
  });
  socket.on('voice:mute', (d) => {
    const g = socket.data.voiceGroup;
    if (!g || !voice[g] || !voice[g].has(socket.id)) return;
    voice[g].get(socket.id).muted = !!(d && d.muted);
    broadcastVoice(g);
  });
  socket.on('voice:leave', () => leaveVoice(socket));

  socket.on('disconnect', () => {
    leaveVoice(socket);
    const n = (online.get(pin) || 1) - 1;
    if (n <= 0) { online.delete(pin); io.emit('presence', { pin, online: false }); }
    else online.set(pin, n);
  });
});

/* ------------------------------ Start ------------------------------- */
function onListenError(port) {
  return (err) => {
    if (err.code === 'EADDRINUSE') console.error(`\nPort ${port} is already in use. Close the other program (or an old Huddle window) and try again.`);
    else console.error(err);
    process.exit(1);
  };
}
httpServer.on('error', onListenError(HTTP_PORT));
httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  const line = '-'.repeat(58);
  console.log('\n' + line);
  console.log('  Huddle is running  (frontend: ' + (WEB_DIR === CLIENT_DIST ? 'React build' : 'legacy /public') + ')');
  console.log(line);
  if (httpsServer) {
    httpsServer.on('error', onListenError(HTTPS_PORT));
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
      console.log('  Share THIS link with your class (voice + mic work):');
      (ips.length ? ips : ['localhost']).forEach((ip) => console.log(`     https://${ip}:${HTTPS_PORT}`));
      console.log('\n  Chat-only fallback (no mic):');
      (ips.length ? ips : ['localhost']).forEach((ip) => console.log(`     http://${ip}:${HTTP_PORT}`));
      console.log('\n  First time in a browser: click Advanced > Proceed.');
      console.log(line + '\n');
    });
  } else {
    (ips.length ? ips : ['localhost']).forEach((ip) => console.log(`     http://${ip}:${HTTP_PORT}`));
    console.log(line + '\n');
  }
});

process.on('SIGINT', () => { saveNow(); process.exit(0); });
process.on('SIGTERM', () => { saveNow(); process.exit(0); });
