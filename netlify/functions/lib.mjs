// Shared helpers for the Metro Breach 3D account, shop and payment functions.
import crypto from 'node:crypto';
import catalog from './catalog.json' with { type: 'json' };

export const CATALOG = catalog;

// Credit packs. Edit the numbers here. Prices are in US cents and are only ever read on the server.
export const PACKS = [
  { id: 'p1', cr: 500, cents: 99, label: 'Starter' },
  { id: 'p2', cr: 1300, cents: 199, label: 'Squad' },
  { id: 'p3', cr: 3500, cents: 499, label: 'Platoon' },
  { id: 'p4', cr: 8000, cents: 999, label: 'Army' },
];

export const START_CREDITS = 300;
export const EARN_PER_CALL = 400;
export const EARN_PER_HOUR = 800;

let _store;
export async function store() {
  if (globalThis.__MBSTORE) return globalThis.__MBSTORE;
  if (!_store) {
    const { getStore } = await import('@netlify/blobs');
    _store = getStore('mb3d');
  }
  return _store;
}

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// Verify a Google Sign-In ID token and return who it belongs to, or null.
export async function verifyGoogle(token) {
  const cid = process.env.GOOGLE_CLIENT_ID;
  if (!cid || typeof token !== 'string' || token.length < 20 || token.length > 4096) return null;
  let r;
  try { r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token)); } catch { return null; }
  if (!r.ok) return null;
  const j = await r.json();
  const okIss = j.iss === 'accounts.google.com' || j.iss === 'https://accounts.google.com';
  if (j.aud !== cid || !okIss || !j.sub || !(Number(j.exp) * 1000 > Date.now())) return null;
  return { sub: String(j.sub).replace(/[^0-9a-zA-Z_-]/g, ''), name: String(j.name || j.given_name || 'Player').slice(0, 40), picture: typeof j.picture === 'string' ? j.picture : '' };
}

export const blank = () => ({ cr: START_CREDITS, own: { c: [0], g: [0] }, eq: { c: 0, g: 0 }, earn: { h: 0, n: 0 } });

export async function loadAcct(sub) {
  const s = await store();
  const a = await s.get('acct/' + sub, { type: 'json' });
  return a && a.own ? a : blank();
}
export async function saveAcct(sub, a) {
  const s = await store();
  await s.setJSON('acct/' + sub, a);
}
export const pub = (a) => ({ cr: a.cr, own: a.own, eq: a.eq });

// Add credits that were paid for. Safe to call twice for the same Stripe session.
export async function creditPurchase(sub, packId, sessionId) {
  const pack = PACKS.find((p) => p.id === packId);
  if (!pack || !sub || !sessionId) return false;
  const s = await store();
  const mark = 'paid/' + String(sessionId).replace(/[^0-9a-zA-Z_]/g, '');
  if (await s.get(mark, { type: 'json' })) return true;
  const a = await loadAcct(sub);
  a.cr += pack.cr;
  await saveAcct(sub, a);
  await s.setJSON(mark, { sub, pack: pack.id, at: Date.now() });
  return true;
}

export function verifyStripeSignature(body, header, secret, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')).filter((p) => p.length === 2));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1 || Math.abs(now / 1000 - Number(t)) > 300) return false;
  const exp = crypto.createHmac('sha256', secret).update(t + '.' + body).digest('hex');
  const a = Buffer.from(exp), b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Long-lived login sessions. After one Google sign-in the server hands out its own random token,
// so the player stays signed in on this device (about 90 days) without Google's 1-hour token.
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
export async function newSession(u) {
  const t = crypto.randomBytes(32).toString('hex');
  const s = await store();
  await s.setJSON('sess/' + sha(t), { sub: u.sub, name: u.name, picture: u.picture, exp: Date.now() + 90 * 86400000 });
  return 'S.' + t;
}
export async function authUser(token) {
  if (typeof token !== 'string') return null;
  if (token.startsWith('S.')) {
    const t = token.slice(2);
    if (!/^[0-9a-f]{64}$/.test(t)) return null;
    const r = await (await store()).get('sess/' + sha(t), { type: 'json' });
    if (!r || !(r.exp > Date.now())) return null;
    return { sub: r.sub, name: r.name, picture: r.picture, session: true };
  }
  return verifyGoogle(token);
}
export async function endSession(token) {
  if (typeof token !== 'string' || !token.startsWith('S.')) return;
  const t = token.slice(2);
  if (/^[0-9a-f]{64}$/.test(t)) await (await store()).delete('sess/' + sha(t));
}
