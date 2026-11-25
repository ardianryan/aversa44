import { isIP } from 'node:net';

export function normalizeIp(value: string): string | null {
  const input = value.trim().replace(/^::ffff:/i, '');
  return isIP(input) ? input.toLowerCase() : null;
}

export function isPrivateOrTailscaleIp(ip: string | null): boolean {
  if (!ip) return false;
  if (ip === '127.0.0.1' || ip === '::1') return true;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8 (LAN / VPN)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (Docker / LAN)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (LAN)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (Tailscale CGNAT)
  return false;
}

export function isAllowedOrigin(origin: string | undefined, publicSiteUrl: string, isDev: boolean): boolean {
  if (!origin) return false;
  if (origin === publicSiteUrl) return true;
  if (isDev && /^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin)) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost') return true;
    return isPrivateOrTailscaleIp(normalizeIp(host));
  } catch {
    return false;
  }
}

export function resolveClientIp(peer: string, forwarded: string, trusted: string[]): string | null {
  const socketIp = normalizeIp(peer);
  if (!socketIp) return null;
  if (!trusted.includes(socketIp)) return socketIp;
  return normalizeIp(forwarded);
}

export function resolveChallengeHostname(origin: string | undefined, hostHeader: string | undefined, publicSiteUrl: string, isDev: boolean): string {
  const fallback = new URL(publicSiteUrl).hostname;
  if (origin && isAllowedOrigin(origin, publicSiteUrl, isDev)) {
    try {
      return new URL(origin).hostname.replace(/^\[|\]$/g, '');
    } catch {
      return fallback;
    }
  }
  if (hostHeader) {
    const host = hostHeader.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').trim().toLowerCase();
    if (host === 'localhost' || isPrivateOrTailscaleIp(normalizeIp(host))) {
      return host;
    }
  }
  return fallback;
}

export async function verifyTurnstile(token: unknown, action: string, hostname: string, remoteIp: string, secret: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (typeof token !== 'string' || !token || token.length > 2048 || !secret) return false;
  try {
    const params = new URLSearchParams({ secret, response: token });
    if (remoteIp && !isPrivateOrTailscaleIp(normalizeIp(remoteIp))) {
      params.set('remoteip', remoteIp);
    }
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return false;
    const data = await response.json() as { success?: boolean; action?: string; hostname?: string };
    return data.success === true && data.action === action && data.hostname?.toLowerCase() === hostname.toLowerCase();
  } catch { return false; }
}
