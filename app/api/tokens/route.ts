// app/api/tokens/route.ts
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureShortcutTables } from '@/lib/schema';
import { getSessionEmail } from '@/lib/session';
import { generateToken, hashToken } from '@/lib/apiToken';

// トークンを使えるのは、Googleアカウントでログインしている人だけ
async function requireLogin(): Promise<{ email: string } | NextResponse> {
  const email = await getSessionEmail();
  if (!email) {
    return NextResponse.json({ error: 'Googleアカウントでのログインが必要です' }, { status: 401 });
  }
  return { email };
}

// トークンの状態（発行済みか・いつ発行したか・最後にいつ使ったか）。トークン本体は返さない
export async function GET() {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;

  try {
    await ensureShortcutTables();
    const res = await query('SELECT created_at, last_used_at FROM api_tokens WHERE owner_id = $1', [auth.email]);
    const row = res.rows[0];
    return NextResponse.json({
      hasToken: !!row,
      createdAt: row?.created_at ?? null,
      lastUsedAt: row?.last_used_at ?? null,
    });
  } catch (error) {
    console.error('トークン状態の取得エラー:', error);
    return NextResponse.json({ error: 'Failed to fetch token status' }, { status: 500 });
  }
}

// トークンの発行（すでにあれば再発行。古いトークンは使えなくなる）
// ※トークン本体が返るのは、このレスポンスだけ
export async function POST() {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;

  try {
    await ensureShortcutTables();
    const token = generateToken();
    await query(
      `INSERT INTO api_tokens (owner_id, token_hash) VALUES ($1, $2)
       ON CONFLICT (owner_id) DO UPDATE SET token_hash = $2, created_at = CURRENT_TIMESTAMP, last_used_at = NULL`,
      [auth.email, hashToken(token)]
    );
    return NextResponse.json({ success: true, token });
  } catch (error) {
    console.error('トークン発行エラー:', error);
    return NextResponse.json({ error: 'Failed to issue token' }, { status: 500 });
  }
}

// トークンの無効化
export async function DELETE() {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;

  try {
    await ensureShortcutTables();
    await query('DELETE FROM api_tokens WHERE owner_id = $1', [auth.email]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('トークン無効化エラー:', error);
    return NextResponse.json({ error: 'Failed to revoke token' }, { status: 500 });
  }
}
