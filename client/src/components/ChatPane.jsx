import { useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { Avatar } from './Avatar.jsx';
import { Lounge } from './Lounge.jsx';
import { Messages } from './Messages.jsx';
import { Composer } from './Composer.jsx';

function statusOf(chat, online, typers) {
  if (typers.length) {
    return { text: chat.type === 'dm' ? 'typing...' : typers.slice(0, 2).join(' and ') + ' typing...', hot: true };
  }
  if (chat.type === 'dm') {
    const hot = online.has(chat.pin);
    return { text: hot ? 'Online' : 'Offline', hot };
  }
  const on = chat.members.filter((p) => online.has(p)).length;
  return { text: chat.members.length + ' members, ' + on + ' online', hot: on > 1 };
}

export function ChatPane({ chat, mePin, online, typers, voice, sid, socketRef, progress, rec, onBack, onSendText, onSendFiles }) {
  const [dropping, setDropping] = useState(false);
  const depth = useRef(0);
  const st = statusOf(chat, online, typers);

  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  const drag = {
    onDragEnter: (e) => { if (hasFiles(e)) { depth.current++; setDropping(true); } },
    onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDropping(false); },
    onDragOver: (e) => e.preventDefault(),
    onDrop: (e) => {
      e.preventDefault(); depth.current = 0; setDropping(false);
      if (e.dataTransfer.files.length) onSendFiles([...e.dataTransfer.files]);
    }
  };

  return (
    <div id="chat" className="chat" {...drag}>
      <header className="chat-head">
        <button id="back" className="ib" type="button" aria-label="Back to chats" onClick={onBack}><Icon id="back" /></button>
        <span id="ch-avatar"><Avatar name={chat.name} pin={chat.pin} type={chat.type} /></span>
        <div className="ch-text"><h2 id="ch-name">{chat.name}</h2><small id="ch-status" className={st.hot ? 'hot' : ''}>{st.text}</small></div>
      </header>

      {chat.type === 'group' && <Lounge chat={chat} voice={voice} sid={sid} />}

      <Messages chat={chat} mePin={mePin} />
      <div id="drop" className="drop" hidden={!dropping}>Drop files to send them</div>

      <div id="upload-strip" className="upload-strip" hidden={!progress}>
        <span id="up-label">{progress ? progress.label : ''}</span>
        <i><b id="up-bar" style={{ width: (progress ? progress.pct : 0) + '%' }} /></i>
      </div>

      <Composer chat={chat} socketRef={socketRef} onSendText={onSendText} onSendFiles={onSendFiles} rec={rec} />
    </div>
  );
}
