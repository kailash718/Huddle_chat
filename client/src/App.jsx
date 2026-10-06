import { useCallback, useEffect, useState } from 'react';
import { Auth, Reveal } from './components/Auth.jsx';
import { Messenger } from './components/Messenger.jsx';
import { IconSprite } from './components/Icon.jsx';
import { ME_KEY } from './lib.js';
import { useToast } from './toast.jsx';

function loadMe() {
  try { return JSON.parse(localStorage.getItem(ME_KEY)); } catch (_) { return null; }
}

export default function App() {
  const toast = useToast();
  const [me, setMe] = useState(() => { const m = loadMe(); return m && m.pin && m.token ? m : null; });
  const [screen, setScreen] = useState(me ? 'app' : 'auth');   // auth | reveal | app
  const [config, setConfig] = useState({ httpsPort: null, maxFileMb: 50 });

  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then(setConfig).catch(() => {});
  }, []);

  /* plain http link: mic is blocked, so point people at the https link */
  const insecure = !window.isSecureContext && !!config.httpsPort;
  useEffect(() => { document.body.classList.toggle('has-bar', insecure); }, [insecure]);

  const save = (m) => { localStorage.setItem(ME_KEY, JSON.stringify(m)); setMe(m); };
  const authFail = useCallback(() => {
    localStorage.removeItem(ME_KEY);
    setMe(null); setScreen('auth');
    toast('Please sign in again.');
  }, [toast]);
  const signOut = () => {
    if (!confirm('Sign out? You can sign back in later with your PIN and name.')) return;
    localStorage.removeItem(ME_KEY);
    location.reload();
  };

  return (
    <>
      <IconSprite />
      {insecure && (
        <div id="secure-bar" className="secure-bar">
          <span>Voice calls and voice notes are off on this link.</span>
          <a id="secure-link" href={'https://' + location.hostname + ':' + config.httpsPort}>Open the secure link</a>
        </div>
      )}
      {screen === 'auth' && <Auth onRegistered={(m) => { save(m); setScreen('reveal'); }} onLoggedIn={(m) => { save(m); setScreen('app'); }} />}
      {screen === 'reveal' && me && <Reveal me={me} onGo={() => setScreen('app')} />}
      {screen === 'app' && me && <Messenger me={me} config={config} onAuthFail={authFail} onSignOut={signOut} />}
    </>
  );
}
