import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export interface PasswordVerifier {
  algorithm: "scrypt";
  version: 1;
  N: number;
  r: number;
  p: number;
  salt: string;
  hash: string;
}

const parameters = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
// Bound memory-heavy work within each Lambda execution environment.
let busy = false;

export function validatePassword(password: string): void {
  const length = [...password].length;
  if (length < 8 || length > 128 || Buffer.byteLength(password, "utf8") > 512) {
    throw new Error("Password must contain 8 to 128 characters.");
  }
}

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (busy) throw new Error("Password verification capacity exceeded.");
  busy = true;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, parameters, (error, key) => error ? reject(error) : resolve(key));
    });
  } finally {
    busy = false;
  }
}

export async function hashPassword(password: string): Promise<PasswordVerifier> {
  validatePassword(password);
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return { algorithm: "scrypt", version: 1, N: parameters.N, r: 8, p: 1,
    salt: salt.toString("hex"), hash: key.toString("hex") };
}

export async function verifyPassword(password: string, verifier: PasswordVerifier): Promise<boolean> {
  if (verifier.algorithm !== "scrypt" || verifier.version !== 1 || verifier.N !== parameters.N ||
    verifier.r !== 8 || verifier.p !== 1 || !/^[a-f0-9]{32}$/.test(verifier.salt) ||
    !/^[a-f0-9]{128}$/.test(verifier.hash) || Buffer.byteLength(password, "utf8") > 512) return false;
  return timingSafeEqual(await derive(password, Buffer.from(verifier.salt, "hex")), Buffer.from(verifier.hash, "hex"));
}
