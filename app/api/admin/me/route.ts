// app/api/admin/me/route.ts
import { NextResponse } from 'next/server';
import { getSessionEmail } from '@/lib/session';
import { isAdminEmail } from '@/lib/admin';

// 今のログイン状態が管理者かどうかを返す（管理者画面の入口チェック用）
export async function GET() {
  const email = await getSessionEmail();

  const body: Record<string, unknown> = {
    loggedIn: !!email,
    isAdmin: isAdminEmail(email),
  };

  // 開発中だけ、原因調べ用の情報を付ける（本番では返さない）
  if (process.env.NODE_ENV !== 'production') {
    body.debug = {
      loginEmail: email, // ログイン中のGoogleアカウント（自分自身のアドレス）
      adminEmailsCount: (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean).length, // 0 なら ADMIN_EMAILS が読み込まれていない
    };
  }

  return NextResponse.json(body);
}
