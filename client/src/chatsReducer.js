import { ck } from './lib.js';

/* All chats live in one object: { 'group:6767': chat, 'dm:1234': chat } */
const blank = (i) => ({
  key: ck(i.type, i.pin), type: i.type, pin: i.pin, name: i.name,
  messages: [], loaded: false, unread: 0, last: null, members: [], voice: []
});

function merge(c, i) {
  const n = { ...c };
  if (i.name) n.name = i.name;
  if (i.last !== undefined) n.last = i.last;
  if (i.members) n.members = i.members;
  if (i.voice) n.voice = i.voice;
  return n;
}

const upsert = (state, info) => {
  const key = ck(info.type, info.pin);
  return { ...state, [key]: merge(state[key] || blank(info), info) };
};

const patch = (state, key, fn) => (state[key] ? { ...state, [key]: fn(state[key]) } : state);

export function chatsReducer(state, a) {
  switch (a.type) {
    case 'init': {
      let s = state;
      a.chats.forEach((info) => {
        s = upsert(s, info);
        const key = ck(info.type, info.pin);
        s = patch(s, key, (c) => ({ ...c, unread: info.unread, loaded: false }));
      });
      return s;
    }
    case 'upsert':
      return upsert(state, a.info);
    case 'loaded': {
      const s = upsert(state, a.info);
      return patch(s, ck(a.info.type, a.info.pin), (c) => ({ ...c, messages: a.messages, loaded: true }));
    }
    case 'message': {
      const { chat, message, bump } = a;
      const key = ck(chat.type, chat.pin);
      let s = upsert(state, chat);
      const c = s[key];
      if (c.messages.some((m) => m.id === message.id)) return state;
      const messages = [...c.messages, message].slice(-500);
      return { ...s, [key]: { ...c, messages, last: message, unread: bump ? c.unread + 1 : c.unread } };
    }
    case 'read':
      return patch(state, a.key, (c) => (c.unread ? { ...c, unread: 0 } : c));
    case 'readPin': {
      let s = state;
      ['group', 'dm'].forEach((t) => { s = patch(s, ck(t, a.pin), (c) => (c.unread ? { ...c, unread: 0 } : c)); });
      return s;
    }
    case 'members':
      return patch(state, ck('group', a.pin), (c) => ({ ...c, members: a.members }));
    case 'voice':
      return patch(state, ck('group', a.group), (c) => ({ ...c, voice: a.participants }));
    default:
      return state;
  }
}
