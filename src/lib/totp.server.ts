import { createHmac, randomBytes } from "node:crypto";

const ALPH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret() {
  return toBase32(randomBytes(20));
}

export function verifyTotp(secretB32: string, token: string) {
  const cleaned = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const secret = fromBase32(secretB32);
  const t = Math.floor(Date.now() / 1000 / 30);
  for (const w of [t - 1, t, t + 1]) {
    if (hotp(secret, w) === cleaned) return true;
  }
  return false;
}

function hotp(secret: Buffer, counter: number) {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return String(code % 1e6).padStart(6, "0");
}

function toBase32(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPH[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPH[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(input: string) {
  const s = input.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of s) {
    const idx = ALPH.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
