import { useCallback, useState } from 'react';

/* Uploads one file with a progress bar. Returns { progress, upload } */
export function useUpload(me, maxFileMb) {
  const [progress, setProgress] = useState(null); // null | { label, pct }

  const upload = useCallback((file, label) => new Promise((resolve, reject) => {
    if (file.size > maxFileMb * 1048576) return reject(new Error((label || file.name) + ' is bigger than ' + maxFileMb + ' MB.'));
    setProgress({ label: 'Sending ' + (label || file.name), pct: 0 });
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.setRequestHeader('x-pin', me.pin);
    xhr.setRequestHeader('x-token', me.token);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress((p) => p && { ...p, pct: Math.round((e.loaded / e.total) * 100) });
    };
    xhr.onload = () => {
      setProgress(null);
      let j = {}; try { j = JSON.parse(xhr.responseText); } catch (_) { /* ignore */ }
      if (xhr.status === 200) resolve(j); else reject(new Error(j.error || 'Upload failed'));
    };
    xhr.onerror = () => { setProgress(null); reject(new Error('Upload failed. Check your connection.')); };
    const fd = new FormData(); fd.append('file', file, file.name);
    xhr.send(fd);
  }), [me.pin, me.token, maxFileMb]);

  return { progress, upload };
}
