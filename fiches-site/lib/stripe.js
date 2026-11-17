// Petit client Stripe sans dépendance (paiements des abonnements Carnet Plus).
const crypto = require('crypto');

const API = 'https://api.stripe.com/v1';
const configured = () => !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);

// { a: { b: 1 }, c: [x] } -> a[b]=1&c[0]=x  (format attendu par Stripe)
function encode(obj, prefix, out) {
  out = out || [];
  Object.keys(obj).forEach((k) => {
    const v = obj[k], key = prefix ? prefix + '[' + k + ']' : k;
    if (v === undefined || v === null) return;
    if (typeof v === 'object') encode(v, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  });
  return out;
}

async function stripe(method, path, params) {
  const init = { method, headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY } };
  if (params) { init.headers['Content-Type'] = 'application/x-www-form-urlencoded'; init.body = encode(params).join('&'); }
  const r = await fetch(API + path, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((j.error && j.error.message) || 'stripe ' + r.status), { status: r.status });
  return j;
}

// Vérifie que le message vient bien de Stripe (signature « Stripe-Signature »).
function verifySignature(raw, header, secret, toleranceSec) {
  if (!raw || !header || !secret) return false;
  const parts = String(header).split(',').map((p) => p.trim().split('='));
  const t = (parts.find((p) => p[0] === 't') || [])[1];
  const sigs = parts.filter((p) => p[0] === 'v1').map((p) => p[1]);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > (toleranceSec || 300)) return false;
  const expected = crypto.createHmac('sha256', secret).update(t + '.' + raw).digest('hex');
  const e = Buffer.from(expected);
  return sigs.some((s) => { const b = Buffer.from(s); return b.length === e.length && crypto.timingSafeEqual(b, e); });
}

// Adresse du site (pour les pages de retour après paiement)
function siteUrl(req) {
  const env = String(process.env.SITE_URL || '').replace(/\/+$/, '');
  if (/^https?:\/\//.test(env)) return env;
  const host = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '';
  return 'https://' + host;
}

module.exports = { configured, stripe, verifySignature, siteUrl, encode };
