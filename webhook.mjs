import { json, creditPurchase, verifyStripeSignature } from './lib.mjs';

// Stripe calls this after a payment. This is the ONLY place real-money credits are added.
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const body = await req.text();
  if (!verifyStripeSignature(body, req.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)) return json({ error: 'bad signature' }, 400);
  let ev;
  try { ev = JSON.parse(body); } catch { return json({ error: 'bad json' }, 400); }
  if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
    const s = ev.data && ev.data.object;
    if (s && s.payment_status === 'paid' && s.metadata) await creditPurchase(s.metadata.sub, s.metadata.pack, s.id);
  }
  return json({ received: true });
};
export const config = { path: '/api/webhook' };
