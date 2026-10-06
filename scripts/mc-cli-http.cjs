'use strict';

async function httpRequest({ baseUrl, apiKey, cookie, method, route, body, timeoutMs = 20000 }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 3600000) {
    throw new Error('Request timeout must be between 1 and 3600000 milliseconds');
  }
  const url = `${baseUrl}${route.startsWith('/') ? route : `/${route}`}`;
  const headers = { Accept: 'application/json', 'User-Agent': 'MissionControlCLI/2' };
  if (apiKey) headers['x-api-key'] = apiKey;
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let result;
  for (let attempt = 0; attempt < (method === 'GET' ? 2 : 1); attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers, redirect: 'error',
        body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      return { ok: res.ok, status: res.status, data,
        setCookie: res.headers.get('set-cookie') || '', url, method };
    } catch (error) {
      const timeout = error?.name === 'AbortError';
      result = { ok: false, status: 0, data: { error: timeout
        ? `Request timeout after ${timeoutMs}ms` : 'Network request failed' },
      ...(timeout ? { timeout: true } : { network: true }), url, method };
    } finally { clearTimeout(timer); }
  }
  return result;
}

function publicResult(result) {
  const { setCookie, ...safe } = result;
  if (setCookie) safe.saved_cookie_header = '[redacted]';
  return safe;
}

module.exports = { httpRequest, publicResult };
