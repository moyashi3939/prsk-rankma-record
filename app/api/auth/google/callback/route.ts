import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { query } from '@/lib/db';
import { ensureAppSettings, adoptDataOnLogin } from '@/lib/schema';
import { createSessionValue, isValidGuestId, GUEST_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const googleError = searchParams.get('error'); // ユーザーが同意画面でキャンセルした場合など

  const base = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;
  const fail = (reason: string) => NextResponse.redirect(new URL(`/settings?error=${reason}`, base));

  if (googleError || !code) {
    console.error('Googleログイン: コードなし/キャンセル', googleError);
    return fail('auth_failed');
  }

  try {
    const redirectUri = `${base}/api/auth/google/callback`;

    // 1. 認可コードをアクセストークンに交換
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      // redirect_uri_mismatch / invalid_client などの原因がここに出る
      console.error('Googleトークン取得失敗:', tokenData.error, tokenData.error_description, 'redirect_uri=', redirectUri);
      return fail('auth_failed');
    }

    // 2. Googleのユーザー情報を取得
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await userRes.json();
    const { email, name } = googleUser;
    if (!email) {
      console.error('Googleユーザー情報にemailがありません:', googleUser);
      return fail('auth_failed');
    }

    // 3. テーブルを整えて、ユーザーを登録（なければ作成）
    await ensureAppSettings();
    const customId = 'user_' + Math.random().toString(36).substring(2, 8);
    await query(
      `INSERT INTO app_settings (user_name, custom_id, user_email, current_season)
       VALUES ($1, $2, $3, 'Season 1')
       ON CONFLICT (user_email) DO NOTHING`,
      [name || 'Google User', customId, email]
    );

    // 4. ゲストで使っていたデータ／ユーザー別にする前の旧データを、このアカウントに引き継ぐ
    //    （失敗してもログイン自体は続行する）
    try {
      const guestCookie = (await cookies()).get(GUEST_COOKIE)?.value;
      await adoptDataOnLogin(email, isValidGuestId(guestCookie) ? guestCookie : null);
    } catch (e) {
      console.error('データ引き継ぎエラー（ログインは続行）:', e);
    }

    // 5. 署名付きのログインCookieを保存（30日間保持）
    const response = NextResponse.redirect(new URL('/settings?login=success', base));
    response.cookies.set(SESSION_COOKIE, createSessionValue(email), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE,
    });
    // 旧方式（署名なし）のCookieは削除
    response.cookies.set('user_email', '', { path: '/', httpOnly: true, expires: new Date(0) });
    return response;
  } catch (error) {
    console.error('Google認証サーバーエラー:', error);
    return fail('server_error');
  }
}
