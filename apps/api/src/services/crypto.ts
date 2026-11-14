import crypto from 'node:crypto';
import { env } from '../config/env';

const KEY = Buffer.from(env.FIELD_ENCRYPTION_KEY, 'hex');
if (KEY.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');

/** AES-256-GCM field-level encryption. Output: v1:<iv>:<tag>:<ciphertext>, all base64url. */
export function encryptValue(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
}

export function decryptValue(payload: string): unknown {
  const [version, iv, tag, ct] = payload.split(':');
  if (version !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Unrecognised ciphertext');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}

/** Salted SHA-256 of an E.164-ish phone number. The raw number is never stored. */
export function hashPhone(phone: string): string {
  const normalised = phone.replace(/[^\d+]/g, '');
  return crypto.createHash('sha256').update(`${env.PHONE_HASH_SALT}:${normalised}`).digest('hex');
}

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export const newId = (): string => crypto.randomUUID();

export function timingSafeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}
