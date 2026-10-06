'use strict';
const { httpRequest } = require('./mc-cli-http.cjs');
const { saveProfile } = require('./mc-cli-profile.cjs');

async function desktopLogin(ctx, flags, dependencies = {}) {
  const request = dependencies.request || httpRequest;
  const save = dependencies.save || saveProfile;
  const now = dependencies.now || Date.now;
  const sleep = dependencies.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const emit = dependencies.emit || (code => console.error(
    `In Mission Control desktop Settings > Browser access, approve: ${code}\nWaiting up to five minutes. No password is needed.`));
  const parsed = new URL(ctx.baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password ||
      !(['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) || parsed.protocol === 'https:')) {
    throw new Error('Desktop sign-in requires loopback HTTP(S) or HTTPS');
  }
  const expected = flags['expected-user'];
  if (typeof expected !== 'string' || !expected.trim()) throw new Error('Missing required flag --expected-user');
  const call = (method, route, body, cookie) => request({ baseUrl: ctx.baseUrl,
    timeoutMs: ctx.timeoutMs, method, route, body, cookie });
  const issued = await call('POST', '/api/auth/desktop-browser/request');
  if (!issued.ok) return issued;
  const { request_id: requestId, code, expires_at: expiresAt } = issued.data || {};
  if (!/^[A-Za-z0-9_-]{43}$/.test(requestId || '') || !/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code || '') ||
      !Number.isFinite(expiresAt) || expiresAt * 1000 <= now()) throw new Error('Invalid sign-in response');
  const deadline = Math.min(expiresAt * 1000, now() + 300000);
  emit(code);
  while (now() < deadline) {
    const polled = await call('POST', '/api/auth/desktop-browser/poll', { request_id: requestId });
    if (!polled.ok) throw new Error('Sign-in was not completed; start a fresh one-time code. No profile changed.');
    if (polled.data?.status === 'pending') { await sleep(2000); continue; }
    if (polled.data?.status !== 'approved') throw new Error('Unexpected sign-in state; no profile changed');
    const cookie = polled.setCookie?.match(/(?:^|,\s*)((?:__Host-)?mc-session=[A-Za-z0-9_-]+)(?:;|$)/)?.[1];
    if (!cookie) throw new Error('Approved sign-in returned no session; start a fresh code');
    const identity = await call('GET', '/api/auth/me', undefined, cookie);
    if (!identity.ok || identity.data?.user?.username !== expected.trim()) {
      // Destroy only the new mismatched session, never the desktop's session.
      await call('POST', '/api/auth/logout', undefined, cookie);
      throw new Error(`Approved account verification failed (HTTP ${identity.status}, account ${identity.data?.user?.username || 'unavailable'}); profile unchanged`);
    }
    save({ name: ctx.profile.name, url: ctx.baseUrl, apiKey: '', cookie }, undefined, true);
    return { ok: true, status: 200, method: 'POST', url: `${ctx.baseUrl}/api/auth/desktop-browser/poll`,
      data: { profile: ctx.profile.name, saved_cookie: true, user: {
        username: identity.data?.user.username, role: identity.data?.user.role,
        workspace_id: identity.data?.user.workspace_id, tenant_id: identity.data?.user.tenant_id } } };
  }
  throw new Error('Sign-in code expired; no profile changed');
}

module.exports = { desktopLogin };
