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
// Authorization ヘッダから、トークンを取り出す。
// 「Bearer トークン」が正しい書き方だが、ショートカットで、手で入力するときの書き間違い（Beater など）や、
// 「Bearer」を付け忘れたとき（トークンだけ）でも、トークン（prsk_ で始まる文字列）が分かれば、受け付ける。
// （トークンそのものが、推測できない長い文字列なので、前に付く単語は、安全性に関係しない）
export function extractToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = new RegExp(`(?:^|\\s)(${TOKEN_PREFIX}\\S+)\\s*$`).exec(header.trim());
  if (!match || match[1].length > 200) return null;
  return match[1];
}

export async function ownerFromBearer(request: Request): Promise<string | null> {
  const token = extractToken(request.headers.get('authorization'));
  if (!token) return null;

  await ensureShortcutTables();
  const res = await query(
    'UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = $1 RETURNING owner_id',
    [hashToken(token)]
  );
  return res.rows[0]?.owner_id ?? null;
}
