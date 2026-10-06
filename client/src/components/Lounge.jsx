import { Icon } from './Icon.jsx';
import { Avatar } from './Avatar.jsx';

export function Lounge({ chat, voice, sid }) {
  const parts = chat.voice || [];
  const inCall = voice.group === chat.pin;
  return (
    <section id="lounge" className="lounge" aria-label="Voice lounge">
      <div className="lounge-row">
        <div className="lounge-title">
          <span className="lounge-ic"><Icon id="headphones" /></span>
          <div>
            <b>Voice lounge</b>
            <small id="lounge-sub">
              {parts.length ? parts.length + (parts.length === 1 ? ' person is in the call' : ' people are in the call') : 'Nobody is talking yet'}
            </small>
          </div>
        </div>
        <div className="lounge-actions">
          {!inCall ? (
            <button id="v-join" className="btn-join" type="button" onClick={() => voice.join(chat.pin)}><Icon id="mic" />Join voice</button>
          ) : (
            <>
              <button id="v-mute" className="btn-soft" type="button" onClick={() => voice.mute(!voice.muted)}>
                <Icon id={voice.muted ? 'mic-off' : 'mic'} /><span>{voice.muted ? 'Unmute' : 'Mute'}</span>
              </button>
              <button id="v-leave" className="btn-danger" type="button" onClick={() => voice.leave()}><Icon id="hangup" />Leave</button>
            </>
          )}
        </div>
      </div>
      <div id="orbs" className="orbs">
        {parts.map((p) => (
          <div key={p.sid} className="orb" data-sid={p.sid}>
            <Avatar name={p.name} pin={p.pin} large>
              {p.muted && <span className="muted-badge"><Icon id="mic-off" /></span>}
            </Avatar>
            <span className="orb-name">{p.sid === sid ? 'You' : p.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
