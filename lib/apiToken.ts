// lib/apiToken.ts
// iOSショートカットなど、ブラウザ以外から使うための「個別トークン」。
// ・トークンは発行時に1度だけ表示する。DBにはハッシュ（SHA-256）だけを保存する
// ・1アカウントにつき1つ。再発行すると、古いトークンは使えなくなる
import { createHash, randomBytes } from 'crypto';
import { query } from '@/lib/db';
import { ensureShortcutTables } from '@/lib/schema';

export const TOKEN_PREFIX = 'prsk_';

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// リクエストの「Authorization: Bearer <トークン>」を調べて、持ち主（アカウントのメールアドレス）を返す。
// 正しいトークンでなければ null。使ったときに最終使用日時も更新する。
export async function ownerFromBearer(request: Request): Promise<string | null> {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return null;

  const token = match[1];
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;

  await ensureShortcutTables();
  const res = await query(
    'UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = $1 RETURNING owner_id',
    [hashToken(token)]
  );
  return res.rows[0]?.owner_id ?? null;
}
