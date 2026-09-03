import { NextResponse } from 'next/server';
import { readBrowserCookie } from './http-cookies';
import { seal, unseal } from './secure-session';

export const STAGE_COOKIE = 'mck_auth_stage';
export const SESSION_COOKIE = 'mck_session';

export function ok(data = {}, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

export function fail(error, status = 400) {
  const message = error instanceof Error ? error.message : String(error || '请求失败');
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function readStage(request) {
  return unseal(readBrowserCookie(request, STAGE_COOKIE));
}

export function readSession(request) {
  return unseal(readBrowserCookie(request, SESSION_COOKIE));
}

export function setStage(response, payload) {
  response.cookies.set(STAGE_COOKIE, seal({ ...payload, exp: Date.now() + 10 * 60 * 1000 }), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 10 * 60,
  });
}

export function clearStage(response) {
  response.cookies.set(STAGE_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
}

export function setSession(response, payload, maxAge = 12 * 60 * 60) {
  response.cookies.set(SESSION_COOKIE, seal({ ...payload, exp: Date.now() + maxAge * 1000 }), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge,
  });
}

export function clearSession(response) {
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
}

export function requireSession(request) {
  const session = readSession(request);
  if (!session?.jar || !session?.username) throw new Error('登录已失效，请重新登录');
  return session;
}
