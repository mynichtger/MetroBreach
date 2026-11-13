import { json, PACKS } from './lib.mjs';
export default async () =>
  json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '', pay: !!process.env.STRIPE_SECRET_KEY, packs: PACKS });
export const config = { path: '/api/config' };
