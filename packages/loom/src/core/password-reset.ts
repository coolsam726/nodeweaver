import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface PasswordResetEntry {
  userId: string;
  exp: number;
}

export interface PasswordResetStore {
  create(userId: string, ttlMs: number): string;
  consume(token: string): string | null;
  peek(token: string): PasswordResetEntry | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** In-memory single-use password reset tokens (hashed at rest). */
export function createPasswordResetStore(): PasswordResetStore {
  const entries = new Map<string, PasswordResetEntry>();

  function purgeExpired(now = Date.now()): void {
    for (const [key, entry] of entries) {
      if (entry.exp <= now) entries.delete(key);
    }
  }

  return {
    create(userId, ttlMs) {
      purgeExpired();
      const token = randomBytes(32).toString('base64url');
      entries.set(hashToken(token), {
        userId,
        exp: Date.now() + Math.max(60_000, ttlMs),
      });
      return token;
    },
    peek(token) {
      purgeExpired();
      const entry = entries.get(hashToken(token));
      if (!entry || entry.exp <= Date.now()) return null;
      return entry;
    },
    consume(token) {
      purgeExpired();
      const key = hashToken(token);
      const entry = entries.get(key);
      entries.delete(key);
      if (!entry || entry.exp <= Date.now()) return null;
      return entry.userId;
    },
  };
}

/** Constant-time compare for opaque tokens (optional helper). */
export function safeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
