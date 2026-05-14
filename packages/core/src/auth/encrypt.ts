import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32; // bytes (256 bits)
const IV_LEN = 12; // recommended for GCM
const TAG_LEN = 16;
const VERSION = 'v1';

export function generateKey(): string {
  return randomBytes(KEY_LEN).toString('hex');
}

function keyToBuf(key: string): Buffer {
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== KEY_LEN) throw new Error(`Key must be ${KEY_LEN} bytes (got ${buf.length})`);
  return buf;
}

export function encrypt(plaintext: string, keyHex: string): string {
  const key = keyToBuf(keyHex);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decrypt(ciphertext: string, keyHex: string): string {
  const [version, ivB64, tagB64, ctB64] = ciphertext.split(':');
  if (version !== VERSION) throw new Error(`Unsupported ciphertext version: ${version}`);
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Malformed ciphertext');
  const key = keyToBuf(keyHex);
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  if (tag.length !== TAG_LEN) throw new Error('Bad auth tag length');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
