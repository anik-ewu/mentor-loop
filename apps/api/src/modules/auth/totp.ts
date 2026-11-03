import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '../../config/env';

/** Authenticator-app codes (RFC 6238), the defaults every app supports: SHA-1, 6 digits, 30 s. */

const STEP_SECONDS = 30;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function toBase32(bytes: Buffer) {
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function fromBase32(text: string) {
  let bits = '';
  for (const char of text) bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** 160 random bits: the key length RFC 4226 recommends. 20 bytes is exactly 32 base32 characters. */
export const generateTotpSecret = () => toBase32(randomBytes(20));

export const otpauthUrl = (secret: string, email: string) => {
  const params = new URLSearchParams({ secret, issuer: 'MentorLoop' });
  return `otpauth://totp/${encodeURIComponent(`MentorLoop:${email}`)}?${params}`;
};

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

export function totpCode(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', fromBase32(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** The step this code belongs to, allowing one step of clock drift either way, or null. */
export function matchTotpStep(secret: string, code: string, now = Date.now()) {
  const given = Buffer.from(code);
  const step = currentStep(now);
  for (const candidate of [step - 1, step, step + 1]) {
    const expected = Buffer.from(totpCode(secret, candidate));
    if (given.length === expected.length && timingSafeEqual(given, expected)) return candidate;
  }
  return null;
}

/** Its own key, derived so a database leak alone can't produce valid codes. */
const key = () => createHash('sha256').update(`totp:${env.JWT_SECRET}`).digest();

export function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(stored: string) {
  const [iv, tag, data] = stored.split('.').map((part) => Buffer.from(part, 'base64url')) as [
    Buffer,
    Buffer,
    Buffer,
  ];
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
