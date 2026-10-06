/* Small shared helpers (ported from the old app.js) */
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const fmtSize = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
export const fmtDur = (s) => { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
export const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
export const hueOf = (pin) => (parseInt(pin, 10) * 47) % 360;
export const digitsOnly = (v) => v.replace(/\D/g, '').slice(0, 4);
export const ck = (type, pin) => type + ':' + pin;

export function dayLabel(ts) {
  const d = new Date(ts), t = new Date(), y = new Date();
  y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() !== t.getFullYear() ? 'numeric' : undefined });
}

export const isImage = (f) =>
  !!f && (/^image\/(png|jpe?g|gif|webp)$/i.test(f.mime || '') || /\.(png|jpe?g|gif|webp)$/i.test(f.name || ''));

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* fallback below */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
  ta.remove();
  return ok;
}

export async function api(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again.');
  return j;
}

export const secureOK = () =>
  window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

export const ME_KEY = 'huddle.me';
