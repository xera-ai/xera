import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { decrypt, encrypt } from './encrypt';
import { resolveAuthKey } from './key';

export const AuthStateEntrySchema = z.object({
  role: z.string(),
  strategy: z.enum(['storageState', 'apiToken']),
  created_at: z.string(),
  expires_at: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
export type AuthStateEntry = z.infer<typeof AuthStateEntrySchema>;

function pathFor(authDir: string, role: string): string {
  return join(authDir, `${role}.json`);
}

export function writeAuthState(authDir: string, entry: AuthStateEntry): void {
  mkdirSync(authDir, { recursive: true });
  const ct = encrypt(JSON.stringify(entry), resolveAuthKey());
  writeFileSync(pathFor(authDir, entry.role), ct);
}

export function readAuthState(authDir: string, role: string): AuthStateEntry | null {
  const p = pathFor(authDir, role);
  if (!existsSync(p)) return null;
  const txt = readFileSync(p, 'utf8');
  const plain = decrypt(txt, resolveAuthKey());
  return AuthStateEntrySchema.parse(JSON.parse(plain));
}
