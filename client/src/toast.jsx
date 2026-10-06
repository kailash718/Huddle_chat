import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);

  const toast = useCallback((msg) => {
    const id = nextId.current++;
    setItems((l) => [...l, { id, msg, out: false }]);
    setTimeout(() => setItems((l) => l.map((t) => (t.id === id ? { ...t, out: true } : t))), 3200);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 3700);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div id="toasts" className="toasts" aria-live="assertive">
        {items.map((t) => (
          <div key={t.id} className={'toast' + (t.out ? ' out' : '')}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
