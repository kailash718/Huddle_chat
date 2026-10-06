import { useState } from 'react';
import { Icon } from './Icon.jsx';
import { api, copyText, digitsOnly } from '../lib.js';
import { useToast } from '../toast.jsx';

const Mark = () => (
  <svg className="mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" /><path d="M10 9v14M22 9v14M10 16h12" /></svg>
);
export { Mark };

export function Auth({ onRegistered, onLoggedIn }) {
  const [isNew, setIsNew] = useState(true);
  const [reg, setReg] = useState({ name: '', pin: '' });
  const [log, setLog] = useState({ name: '', pin: '' });
  const [errNew, setErrNew] = useState('');
  const [errBack, setErrBack] = useState('');

  const submitNew = async (e) => {
    e.preventDefault();
    setErrNew('');
    const pin = reg.pin.trim();
    if (pin && pin.length !== 4) return setErrNew('A PIN is exactly 4 digits.');
    try { onRegistered(await api('/api/register', { name: reg.name, pin })); }
    catch (ex) { setErrNew(ex.message); }
  };
  const submitBack = async (e) => {
    e.preventDefault();
    setErrBack('');
    try { onLoggedIn(await api('/api/login', { pin: log.pin, name: log.name })); }
    catch (ex) { setErrBack(ex.message); }
  };

  return (
    <main id="auth" className="screen">
      <section className="auth-card">
        <div className="brand big"><Mark /><span>Huddle</span></div>
        <h1>Chat by PIN.<br />Talk out loud.</h1>
        <p className="lede">Your class, on the college network. No email and no internet needed.</p>

        <div className="tabs" role="tablist">
          <button type="button" role="tab" id="tab-new" className={isNew ? 'active' : ''} aria-selected={isNew} onClick={() => setIsNew(true)}>I'm new here</button>
          <button type="button" role="tab" id="tab-back" className={!isNew ? 'active' : ''} aria-selected={!isNew} onClick={() => setIsNew(false)}>I have a PIN</button>
        </div>

        {isNew ? (
          <form id="form-new" className="form" autoComplete="off" onSubmit={submitNew}>
            <label htmlFor="reg-name">Your name</label>
            <input id="reg-name" maxLength={24} placeholder="Abdul" required autoFocus value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} />
            <label htmlFor="reg-pin">Pick a PIN <span className="opt">(leave empty and we'll give you one)</span></label>
            <input id="reg-pin" inputMode="numeric" maxLength={4} placeholder="4 digits" className="pin-input" value={reg.pin} onChange={(e) => setReg({ ...reg, pin: digitsOnly(e.target.value) })} />
            <p className="form-err" id="err-new" role="alert">{errNew}</p>
            <button className="btn-primary" type="submit">Get my PIN</button>
          </form>
        ) : (
          <form id="form-back" className="form" autoComplete="off" onSubmit={submitBack}>
            <label htmlFor="log-pin">Your PIN</label>
            <input id="log-pin" inputMode="numeric" maxLength={4} placeholder="4 digits" className="pin-input" required value={log.pin} onChange={(e) => setLog({ ...log, pin: digitsOnly(e.target.value) })} />
            <label htmlFor="log-name">The name you signed up with</label>
            <input id="log-name" maxLength={24} placeholder="Abdul" required value={log.name} onChange={(e) => setLog({ ...log, name: e.target.value })} />
            <p className="form-err" id="err-back" role="alert">{errBack}</p>
            <button className="btn-primary" type="submit">Sign in</button>
          </form>
        )}
      </section>
    </main>
  );
}

export function Reveal({ me, onGo }) {
  const toast = useToast();
  const copy = async () => toast((await copyText(me.pin)) ? 'PIN copied' : 'Could not copy. Your PIN is ' + me.pin);
  return (
    <main id="reveal" className="screen">
      <section className="reveal-card">
        <h2>This is your PIN</h2>
        <div className="tiles" id="reveal-tiles" aria-label="Your PIN">
          {[...me.pin].map((d, i) => <div key={i} className="tile" style={{ '--i': i }}>{d}</div>)}
        </div>
        <p className="lede">Classmates type these 4 digits to message you. Send it to the friends you want to hear from.</p>
        <div className="row">
          <button className="btn-soft" id="reveal-copy" type="button" onClick={copy}><Icon id="copy" />Copy PIN</button>
          <button className="btn-primary" id="reveal-go" type="button" onClick={onGo}>Start chatting</button>
        </div>
      </section>
    </main>
  );
}
