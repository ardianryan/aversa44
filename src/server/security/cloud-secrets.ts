import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const CONTEXT = Buffer.from('aversa44-cloud-stream-v1');

function parseKey(key: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(key)) throw new Error('CLOUD_STREAM_ENCRYPTION_KEY must be 64 hexadecimal characters.');
  return Buffer.from(key, 'hex');
}

export function sealCloudSecret(plaintext: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', parseKey(key), iv);
  cipher.setAAD(CONTEXT);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((value) => value.toString('base64url')).join('.');
}

export function openCloudSecret(value: string, key: string): string {
  const parts = value.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted cloud secret.');
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64url'));
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted cloud secret.');
  const decipher = createDecipheriv('aes-256-gcm', parseKey(key), iv);
  decipher.setAAD(CONTEXT);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
