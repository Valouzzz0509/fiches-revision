// Abonnement Carnet Plus : ouvre la page de paiement ou la gestion de l'abonnement (Stripe).
const { base, serviceHeaders, configured: sbOk, getUser, rpc } = require('../lib/auth');
const { configured: stripeOk, stripe, siteUrl } = require('../lib/stripe');

async function customerOf(userId) {
  const r = await fetch(base() + '/rest/v1/subscriptions?select=customer_id&user_id=eq.' + encodeURIComponent(userId), { headers: serviceHeaders() });
  const l = r.ok ? await r.json() : [];
  return Array.isArray(l) && l[0] ? l[0].customer_id : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  if (!sbOk()) return res.status(500).json({ error: 'Le site n’est pas encore configuré.' });
  if (!stripeOk()) return res.status(503).json({ error: 'L’abonnement n’est pas encore disponible.' });
  let user = null;
  try { user = await getUser(req); } catch (e) { console.error('auth error:', e); }
  if (!user) return res.status(401).json({ error: 'Connecte-toi pour continuer.' });

  const b = (req.body && typeof req.body === 'object') ? req.body : {};
  const site = siteUrl(req);
  try {
    if (b.action === 'checkout') {
      if (await rpc('is_plus', { p_user: user.id })) return res.status(409).json({ error: 'Tu as déjà Carnet Plus.' });
      const customer = await customerOf(user.id);
      const s = await stripe('POST', '/checkout/sessions', {
        mode: 'subscription',
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: site + '/plus.html?paiement=ok',
        cancel_url: site + '/plus.html?paiement=annule',
        client_reference_id: user.id,
        locale: 'fr',
        allow_promotion_codes: 'true',
        subscription_data: { metadata: { user_id: user.id } },
        ...(customer ? { customer } : { customer_email: user.email }),
      });
      return res.status(200).json({ url: s.url });
    }
    if (b.action === 'portal') {
      const customer = await customerOf(user.id);
      if (!customer) return res.status(404).json({ error: 'Aucun abonnement trouvé.' });
      const s = await stripe('POST', '/billing_portal/sessions', { customer, return_url: site + '/plus.html' });
      return res.status(200).json({ url: s.url });
    }
    return res.status(400).json({ error: 'Demande inconnue.' });
  } catch (e) {
    console.error('billing error:', e);
    return res.status(500).json({ error: 'Impossible d’ouvrir la page de paiement pour le moment. Réessaie dans un instant.' });
  }
};
