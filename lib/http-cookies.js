function splitSetCookie(raw) {
  if (!raw) return [];
  const out = [];
  let start = 0;
  let inExpires = false;
  for (let i = 0; i < raw.length; i++) {
    const lower = raw.slice(i, i + 8).toLowerCase();
    if (lower === 'expires=') inExpires = true;
    if (inExpires && raw[i] === ';') inExpires = false;
    if (!inExpires && raw[i] === ',') {
      const rest = raw.slice(i + 1);
      if (/^\s*[^=;,\s]+\s*=/.test(rest)) {
        out.push(raw.slice(start, i).trim());
        start = i + 1;
      }
    }
  }
  out.push(raw.slice(start).trim());
  return out.filter(Boolean);
}

export function getSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') {
    const values = headers.getSetCookie();
    if (values?.length) return values;
  }
  return splitSetCookie(headers.get('set-cookie'));
}

function defaultPath(pathname) {
  if (!pathname || !pathname.startsWith('/')) return '/';
  if (pathname === '/') return '/';
  const idx = pathname.lastIndexOf('/');
  return idx <= 0 ? '/' : pathname.slice(0, idx + 1);
}

export function storeResponseCookies(jar, requestUrl, headers) {
  const u = new URL(requestUrl);
  const values = getSetCookies(headers);
  const now = Date.now();

  for (const raw of values) {
    const parts = raw.split(';').map((x) => x.trim());
    const first = parts.shift();
    if (!first || !first.includes('=')) continue;
    const eq = first.indexOf('=');
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!name) continue;

    const cookie = {
      name,
      value,
      domain: u.hostname.toLowerCase(),
      path: defaultPath(u.pathname),
      secure: false,
      expires: null,
    };

    for (const attr of parts) {
      const [k0, ...rest] = attr.split('=');
      const k = k0.toLowerCase();
      const v = rest.join('=').trim();
      if (k === 'domain' && v) cookie.domain = v.replace(/^\./, '').toLowerCase();
      else if (k === 'path' && v) cookie.path = v;
      else if (k === 'secure') cookie.secure = true;
      else if (k === 'max-age') {
        const seconds = Number(v);
        if (Number.isFinite(seconds)) cookie.expires = now + seconds * 1000;
      } else if (k === 'expires' && v) {
        const ts = Date.parse(v);
        if (!Number.isNaN(ts)) cookie.expires = ts;
      }
    }

    const index = jar.findIndex((x) => x.name === cookie.name && x.domain === cookie.domain && x.path === cookie.path);
    const expired = cookie.expires !== null && cookie.expires <= now;
    if (expired || value === '') {
      if (index >= 0) jar.splice(index, 1);
      continue;
    }
    if (index >= 0) jar[index] = cookie;
    else jar.push(cookie);
  }
  return jar;
}

export function cookieHeader(jar, requestUrl) {
  const u = new URL(requestUrl);
  const now = Date.now();
  const host = u.hostname.toLowerCase();
  const path = u.pathname || '/';
  return jar
    .filter((c) => !c.expires || c.expires > now)
    .filter((c) => host === c.domain || host.endsWith(`.${c.domain}`))
    .filter((c) => path.startsWith(c.path || '/'))
    .filter((c) => !c.secure || u.protocol === 'https:')
    .sort((a, b) => (b.path?.length || 0) - (a.path?.length || 0))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

export function readBrowserCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) === name) return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return null;
}
