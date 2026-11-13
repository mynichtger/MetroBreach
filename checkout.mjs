import { json, authUser, PACKS } from './lib.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: 'Payments are not set up yet.' }, 503);
  let b;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const u = await authUser(b.token);
  if (!u) return json({ error: 'signin' }, 401);
  const pack = PACKS.find((p) => p.id === b.pack);
  if (!pack) return json({ error: 'unknown pack' }, 400);
  const origin = new URL(req.url).origin;
  const f = new URLSearchParams({
    mode: 'payment',
    'managed_payments[enabled]': 'false',
    success_url: origin + '/?paid=1',
    cancel_url: origin + '/?paid=0',
    client_reference_id: u.sub,
    'metadata[sub]': u.sub,
    'metadata[pack]': pack.id,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(pack.cents),
    'line_items[0][price_data][product_data][name]': pack.cr + ' credits (' + pack.label + ' pack)',
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + key, 'content-type': 'application/x-www-form-urlencoded' },
    body: f,
  });
  const s = await r.json();
  if (!r.ok || !s.url) { console.error('stripe', r.status, JSON.stringify(s)); return json({ error: 'Could not start checkout. Stripe says: ' + ((s && s.error && s.error.message) || r.status) }, 502); }
  return json({ url: s.url });
};
export const config = { path: '/api/checkout' };
