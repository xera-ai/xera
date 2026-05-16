// Crockford base32, monotonic-per-process. Spec-compliant 26-char output.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastMs = 0;
let lastRand = new Uint8Array(10);

// Encodes 48-bit timestamp as 10 Crockford base32 chars (10 × 5 bits = 50 bits;
// the two leading bits are always zero for any ms ≤ 2^48-1, covering ~year 10000).
function timestampPart(ms: number): string {
  let out = '';
  for (let i = 9; i >= 0; i--) {
    const shift = i * 5;
    // Use bigint to safely shift 48-bit values without sign-extension issues
    const part = Number((BigInt(ms) >> BigInt(shift)) & 0x1fn);
    out += CROCKFORD[part];
  }
  return out;
}

// Encodes 10 random bytes (80 bits) as 16 Crockford base32 chars (16 × 5 = 80 bits exactly).
function encodeRandom(buf: Uint8Array): string {
  let out = '';
  let bitBuf = 0;
  let bits = 0;
  for (const b of buf) {
    bitBuf = (bitBuf << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CROCKFORD[(bitBuf >> bits) & 0x1f];
    }
  }
  return out;
}

function bumpRandom(prev: Uint8Array): Uint8Array {
  const next = new Uint8Array(prev);
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i]! === 0xff) {
      next[i] = 0;
      continue;
    }
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
  return timestampPart(now) + encodeRandom(rand);
}
