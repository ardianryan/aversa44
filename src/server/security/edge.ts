import { isIP } from 'node:net';

export function normalizeIp(value: string): string | null {
  const input = value.trim().replace(/^::ffff:/i, '');
  return isIP(input) ? input.toLowerCase() : null;
}

export function resolveClientIp(peer: string, forwarded: string, trusted: string[]): string | null {
  const socketIp = normalizeIp(peer);
  if (!socketIp) return null;
  if (!trusted.includes(socketIp)) return socketIp;
  return normalizeIp(forwarded);
}

export async function verifyTurnstile(token: unknown, action: string, hostname: string, remoteIp: string, secret: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (typeof token !== 'string' || !token || token.length > 2048 || !secret) return false;
  try {
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: remoteIp }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return false;
    const data = await response.json() as { success?: boolean; action?: string; hostname?: string };
    return data.success === true && data.action === action && data.hostname?.toLowerCase() === hostname.toLowerCase();
  } catch { return false; }
}
