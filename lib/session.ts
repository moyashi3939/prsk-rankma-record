// lib/session.ts
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'session'; // ログイン状態（署名付き）
export const GUEST_COOKIE = 'guest_id'; // 未ログイン（ゲスト）を区別するためのランダムID
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30日（秒）
const GUEST_MAX_AGE = 60 * 60 * 24 * 365; // 1年（秒）
const GUEST_ID_PATTERN = /^[0-9a-f-]{36}$/;

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET が未設定です。.env.local に16文字以上のランダムな文字列を設定してください。');
  }
  return secret;
}

function sign(body: string): string {
  return createHmac('sha256', getSecret()).update(body).digest('base64url');
}

// ログイン用の署名付きCookie値を作る： base64url(email).有効期限.署名
export function createSessionValue(email: string): string {
  const payload = Buffer.from(email, 'utf8').toString('base64url');
  const expires = Date.now() + SESSION_MAX_AGE * 1000;
  const body = `${payload}.${expires}`;
  return `${body}.${sign(body)}`;
}

// 署名と有効期限を検証して、メールアドレスを返す（不正なら null）
export function verifySessionValue(value: string | undefined): string | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;

  const [payload, expires, signature] = parts;
  const expected = Buffer.from(sign(`${payload}.${expires}`));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (!(Number(expires) > Date.now())) return null;

  const email = Buffer.from(payload, 'base64url').toString('utf8');
  return email || null;
}

// ログイン中ならメールアドレス、そうでなければ null
export async function getSessionEmail(): Promise<string | null> {
  const store = await cookies();
  return verifySessionValue(store.get(SESSION_COOKIE)?.value);
}

// データの持ち主ID：ログイン中はメールアドレス、ゲストは "guest:<ランダムID>"
// ゲストIDのCookieがなければここで発行する（1リクエストにつき1回だけ呼ぶこと）
export async function getOwnerId(): Promise<string> {
  const store = await cookies();

  const email = verifySessionValue(store.get(SESSION_COOKIE)?.value);
  if (email) return email;

  let guestId = store.get(GUEST_COOKIE)?.value;
  if (!guestId || !GUEST_ID_PATTERN.test(guestId)) {
    guestId = randomUUID();
    store.set(GUEST_COOKIE, guestId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: GUEST_MAX_AGE,
    });
  }
  return `guest:${guestId}`;
}

export function isValidGuestId(value: string | undefined): value is string {
  return !!value && GUEST_ID_PATTERN.test(value);
}
