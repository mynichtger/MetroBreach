import { json, verifyGoogle, loadAcct, saveAcct, pub, CATALOG, EARN_PER_CALL, EARN_PER_HOUR } from './lib.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const u = await verifyGoogle(b.token);
  if (!u) return json({ error: 'signin' }, 401);
  const a = await loadAcct(u.sub);
  const k = b.k === 'g' ? 'g' : 'c';
  const item = (CATALOG[k] || []).find((s) => s.id === b.id);
  if (b.op === 'buy') {
    if (!item) return json({ error: 'no such skin' }, 400);
    if (a.own[k].includes(item.id)) return json({ error: 'already owned' }, 400);
    if (a.cr < item.p) return json({ error: 'not enough credits', data: pub(a) }, 402);
    a.cr -= item.p; a.own[k].push(item.id); a.eq[k] = item.id;
    await saveAcct(u.sub, a);
  } else if (b.op === 'equip') {
    if (!item || !a.own[k].includes(item.id)) return json({ error: 'not owned' }, 400);
    a.eq[k] = item.id;
    await saveAcct(u.sub, a);
  } else if (b.op === 'earn') {
    // Credits earned by playing are accepted with a rate limit. Credits from real money only arrive through the Stripe webhook.
    const n = Math.max(0, Math.min(EARN_PER_CALL, Math.floor(Number(b.n) || 0)));
    const now = Date.now();
    if (!a.earn || now - a.earn.h > 3600000) a.earn = { h: now, n: 0 };
    const give = Math.max(0, Math.min(n, EARN_PER_HOUR - a.earn.n));
    a.earn.n += give; a.cr += give;
    if (give) await saveAcct(u.sub, a);
  } else if (b.op !== 'load') {
    return json({ error: 'unknown op' }, 400);
  } else {
    await saveAcct(u.sub, a);
  }
  return json({ ok: true, user: { name: u.name, picture: u.picture }, data: pub(a) });
};
export const config = { path: '/api/account' };
