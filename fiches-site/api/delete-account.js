// Supprime le compte de la personne connectée et toutes ses fiches (suppression en cascade dans la base).
const { base, serviceHeaders, configured, getUser } = require('../lib/auth');
const { stripe } = require('../lib/stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  if (!configured()) return res.status(500).json({ error: 'Le site n’est pas encore configuré.' });
  let user = null;
  try { user = await getUser(req); } catch (e) { console.error('auth error:', e); }
  if (!user) return res.status(401).json({ error: 'Connecte-toi pour continuer.' });
  try {
    // si la personne a un abonnement Plus, on l'arrête d'abord pour ne plus la facturer
    if (process.env.STRIPE_SECRET_KEY) {
      const sr = await fetch(base() + '/rest/v1/subscriptions?select=sub_id,status&user_id=eq.' + encodeURIComponent(user.id), { headers: serviceHeaders() });
      const rows = sr.ok ? await sr.json() : [];
      const sub = Array.isArray(rows) ? rows[0] : null;
      if (sub && sub.sub_id && ['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status)) {
        try { await stripe('DELETE', '/subscriptions/' + encodeURIComponent(sub.sub_id)); }
        catch (e) {
          if (e.status !== 404) { console.error('stripe cancel error:', e); return res.status(500).json({ error: 'Impossible d’arrêter ton abonnement pour le moment, ton compte n’a pas été supprimé. Réessaie dans un instant.' }); }
        }
      }
    }
    const r = await fetch(base() + '/auth/v1/admin/users/' + encodeURIComponent(user.id), { method: 'DELETE', headers: serviceHeaders() });
    if (!r.ok) throw new Error('admin delete ' + r.status);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('delete-account error:', e);
    return res.status(500).json({ error: 'Impossible de supprimer le compte pour le moment. Réessaie.' });
  }
};
