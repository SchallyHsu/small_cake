import crypto from 'node:crypto';
import { cookieHeader, storeResponseCookies } from './http-cookies';

const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ALLOWED_HOSTS = new Set(['iaaa.pku.edu.cn', 'wproc.pku.edu.cn']);

export function requestNonce() {
  return `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
}

export async function pkuFetch(jar, input, options = {}) {
  const url = input instanceof URL ? input : new URL(input);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error('上游返回了不安全或未知的地址');
  }

  const headers = new Headers(options.headers || {});
  headers.set('user-agent', USER_AGENT);
  headers.set('accept', 'application/json, text/javascript, */*; q=0.01');
  const cookie = cookieHeader(jar, url);
  if (cookie) headers.set('cookie', cookie);

  let body = options.body;
  if (options.form) {
    headers.set('content-type', 'application/x-www-form-urlencoded; charset=utf-8');
    body = new URLSearchParams(options.form).toString();
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body,
    redirect: 'manual',
    cache: 'no-store',
  });
  storeResponseCookies(jar, url, response.headers);
  const text = await response.text();
  return { status: response.status, text, location: response.headers.get('location'), url };
}

export function parseJson(result, context) {
  if (result.status !== 200) throw new Error(`${context}失败，状态码 ${result.status}`);
  try {
    const value = JSON.parse(result.text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new Error(`${context}返回了无法识别的数据`);
  }
}

export function iaaaError(json, fallback = 'IAAA 请求失败') {
  const message = json?.msg || json?.message || json?.m || json?.error || fallback;
  return String(message);
}

export function challengeFromIaaa(json) {
  const asBool = (v) => v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
  if (!asBool(json?.success) || !asBool(json?.isMobileAuthen)) {
    return { type: 'none', canRememberDevice: false, emailVerification: false };
  }
  const mode = String(json?.authenMode || '').toUpperCase();
  return {
    type: mode === 'SMS' ? 'sms' : mode === 'OTP' ? 'otp' : 'none',
    canRememberDevice: asBool(json?.isUnuAuth),
    emailVerification: asBool(json?.emailSuitable),
  };
}

export function encryptPassword(password, publicKeyPem) {
  return crypto.publicEncrypt(
    { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(password, 'utf8'),
  ).toString('base64');
}

export function chinaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${m.year}-${m.month}-${m.day}`;
}

export function normalizeTime(value) {
  const s = String(value || '').trim();
  const match = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return s;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function isWprocOk(json) {
  return json?.e === 0 || String(json?.e) === '0';
}

export async function establishWproc(jar, token) {
  let url = new URL('https://wproc.pku.edu.cn/site/login/cas-login');
  url.searchParams.set('redirect_url', 'https://wproc.pku.edu.cn/v2/site/index');
  url.searchParams.set('_rand', requestNonce());
  url.searchParams.set('token', token);

  for (let i = 0; i < 5; i++) {
    const result = await pkuFetch(jar, url);
    const redirect = [301, 302, 303, 307, 308].includes(result.status) && result.location;
    if (!redirect) return;
    url = new URL(result.location, url);
  }
  throw new Error('WProc 登录跳转次数过多');
}

export async function validateWproc(jar) {
  const url = new URL('https://wproc.pku.edu.cn/site/reservation/list-page');
  url.search = new URLSearchParams({ hall_id: '1', time: chinaDate(), p: '1', page_size: '0' });
  const json = parseJson(await pkuFetch(jar, url), 'WProc 登录验证');
  if (!isWprocOk(json)) throw new Error(json?.m || 'WProc 会话建立失败');
}
