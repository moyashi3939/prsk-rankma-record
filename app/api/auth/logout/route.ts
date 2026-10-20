import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Logged out' });

  // ログインCookieを削除（有効期限を過去に設定）
  for (const name of [SESSION_COOKIE, 'user_email']) {
    response.cookies.set(name, '', {
      path: '/',
      httpOnly: true,
      expires: new Date(0),
    });
  }
  return response;
}
