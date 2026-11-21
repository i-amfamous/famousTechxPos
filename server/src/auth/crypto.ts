import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** scrypt password/PIN hash: "scrypt$<salt b64>$<hash b64>". */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(secret, salt, 32, PARAMS);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifySecret(secret: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [algo, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(secret, Buffer.from(saltB64, "base64"), expected.length, PARAMS);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Readable temporary password for staff without email, e.g. "Ftx-K7pq-Zm4a3". */
export function randomPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // no look-alikes (0/O, 1/l)
  const bytes = randomBytes(10);
  const chars = Array.from(bytes, (x) => alphabet[x % alphabet.length]).join("");
  return `Ftx-${chars.slice(0, 4)}-${chars.slice(4, 8)}${bytes[8]! % 10}`;
}
