import { useEffect, useRef, useState } from 'react';

type Api = { render: (el: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void; reset: (id: string) => void };
declare global { interface Window { turnstile?: Api } }
let loader: Promise<void> | null = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (!loader) loader = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => { loader = null; script.remove(); reject(new Error('load')); };
    document.head.appendChild(script);
  });
  return loader;
}
export function TurnstileChallenge({ action, onToken, resetKey }: { action: string; onToken: (token: string) => void; resetKey: number }) {
  const root = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(onToken); callback.current = onToken;
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/security/turnstile').then(async (r) => { if (!r.ok) throw new Error('config'); return r.json(); }).then(async (config) => {
      if (!config.enabled || cancelled) return;
      if (!config.siteKey) throw new Error('config');
      await loadScript();
      if (cancelled || !root.current || !window.turnstile) return;
      widget.current = window.turnstile.render(root.current, {
        sitekey: config.siteKey, action, theme: 'dark', size: 'flexible', language: 'id',
        callback: (token: string) => callback.current(token),
        'expired-callback': () => callback.current(''),
        'error-callback': () => { callback.current(''); setError(true); },
      });
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; if (widget.current && window.turnstile) window.turnstile.remove(widget.current); widget.current = null; };
  }, [action]);
  useEffect(() => { if (resetKey && widget.current && window.turnstile) window.turnstile.reset(widget.current); }, [resetKey]);
  return <div><div ref={root} />{error && <p role="alert" className="text-sm text-[#F5B8CB]">Verifikasi keamanan tidak dapat dimuat. Periksa koneksi dan muat ulang halaman.</p>}</div>;
}
