

import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';

// Googleログインの開始。
// state（ランダムな値）をCookieに保存して、Googleへの要求にも付ける。
// 戻ってきたときに、この2つが一致しないものは、別のサイトから仕組まれたログインとして拒否する。
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/auth/google/callback`;
  const state = randomBytes(16).toString('hex');

  // 16バイトのランダムな文字列を生成し、それをstateとして使用
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=email%20profile&state=${state}`;

  const response = NextResponse.redirect(googleAuthUrl);
  response.cookies.set('oauth_state', state, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600, // 10分
  });
  return response;
}
