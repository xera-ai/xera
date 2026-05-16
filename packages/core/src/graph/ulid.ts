// Crockford base32, monotonic-per-process. Spec-compliant 26-char output.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastMs = 0;
let lastRand = new Uint8Array(10);

function encode(buf: Uint8Array, length: number): string {
  let out = '';
  let bitBuf = 0;
  let bits = 0;
  for (let i = 0; i < buf.length; i++) {
    bitBuf = (bitBuf << 8) | buf[i]!;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      bits -= 5;
      out += CROCKFORD[(bitBuf >> bits) & 0x1f];
    }
  }
  return out;
}

function timestampBytes(ms: number): Uint8Array {
  const b = new Uint8Array(6);
  for (let i = 5; i >= 0; i--) {
    b[i] = ms & 0xff;
    ms = Math.floor(ms / 256);
  }
  return b;
}

function timestampPart(ms: number): string {
  return encode(timestampBytes(ms), 10);
}

function bumpRandom(prev: Uint8Array): Uint8Array {
  const next = new Uint8Array(prev);
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i]! === 0xff) { next[i] = 0; continue; }
    next[i] = next[i]! + 1;
    break;
  }
  return next;
}

export function ulid(now: number = Date.now()): string {
  let rand: Uint8Array;
  if (now === lastMs) {
    rand = bumpRandom(lastRand);
  } else {
    rand = crypto.getRandomValues(new Uint8Array(10));
    lastMs = now;
  }
  lastRand = rand;
  return timestampPart(now) + encode(rand, 16);
}
