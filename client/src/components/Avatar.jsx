import { Icon } from './Icon.jsx';
import { hueOf } from '../lib.js';

export function Avatar({ name, pin, type = 'dm', large, online, children }) {
  const cls = 'avatar' + (type === 'group' ? ' group' : '') + (large ? ' lg' : '') + (online ? ' on' : '');
  return (
    <span className={cls} style={{ '--h': hueOf(pin) }}>
      {type === 'group' ? <Icon id="hash" /> : ((name || '?').trim().charAt(0) || '?').toUpperCase()}
      {children}
    </span>
  );
}
