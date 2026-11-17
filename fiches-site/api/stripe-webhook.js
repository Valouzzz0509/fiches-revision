// Reçoit les messages de Stripe (paiement réussi, abonnement modifié ou terminé).
// C'est ici que l'abonnement est activé : jamais à partir de ce que dit le navigateur.
const { rpc } = require('../lib/auth');
const { stripe, verifySignature } = require('../lib/stripe');

async function readRaw(req) {
  if (typeof req.rawBody === 'string' || Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');
  if (req.readable && typeof req[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return Buffer.concat(chunks).toString('utf8');
  }
  return typeof req.body === 'string' ? req.body : '';
}
const iso = (sec) => (sec ? new Date(sec * 1000).toISOString() : null);
const periodEnd = (s) => s.current_period_end || (s.items && s.items.data && s.items.data[0] && s.items.data[0].current_period_end) || null;

async function save(sub, userId) {
  const r = await rpc('set_subscription', {
    p_customer: sub.customer, p_user: userId || (sub.metadata && sub.metadata.user_id) || null,
    p_sub: sub.id, p_status: sub.status, p_end: iso(periodEnd(sub)),
  });
  if (r === 'inconnu') console.error('webhook: abonnement sans utilisateur connu', sub.id);
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  const raw = await readRaw(req);
  if (!verifySignature(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) {
    return res.status(400).json({ error: 'Signature invalide.' });
  }
  let ev;
  try { ev = JSON.parse(raw); } catch (e) { return res.status(400).json({ error: 'Message invalide.' }); }
  const o = ev.data && ev.data.object;
  try {
    if (ev.type === 'checkout.session.completed' && o && o.mode === 'subscription' && o.subscription) {
      const sub = await stripe('GET', '/subscriptions/' + encodeURIComponent(o.subscription));
      await save(sub, o.client_reference_id);
    } else if (/^customer\.subscription\.(created|updated|deleted)$/.test(ev.type) && o) {
      await save(ev.type.endsWith('deleted') ? { ...o, status: 'canceled' } : o, null);
    }
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error('webhook error:', e);
    return res.status(500).json({ error: 'Erreur.' });   // Stripe réessaiera
  }
}
module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
