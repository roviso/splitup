import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;
export const hashPassword = async (pw: string) => {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await scryptAsync(pw, salt, 64)).toString('hex')}`;
};
export async function checkPassword(pw: string, stored: string | null) {
  const [, salt, hash] = stored?.split('$') ?? [];
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex'), b = await scryptAsync(pw, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}
