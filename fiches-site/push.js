// Rappels : enregistre ou retire l'abonnement de cet appareil. Il faut être connecté.
const { base, serviceHeaders, configured, getUser } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  if (!configured()) return res.status(500).json({ error: 'Le site n’est pas encore configuré.' });
  let user = null;
  try { user = await getUser(req); } catch (e) { console.error('auth error:', e); }
  if (!user) return res.status(401).json({ error: 'Connecte-toi pour continuer.' });

  const b = (req.body && typeof req.body === 'object') ? req.body : {};
  const T = base() + '/rest/v1/push_subs';
  try {
    if (b.action === 'subscribe') {
      const s = b.sub;
      const ok = s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000
        && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
      if (!ok) return res.status(400).json({ error: 'Abonnement invalide.' });
      const list = await (await fetch(T + '?select=endpoint&user_id=eq.' + encodeURIComponent(user.id), { headers: serviceHeaders() })).json();
      if (Array.isArray(list) && list.length >= 5 && !list.some((x) => x.endpoint === s.endpoint)) return res.status(400).json({ error: 'Trop d’appareils avec les rappels activés.' });
      const r = await fetch(T + '?on_conflict=endpoint', {
        method: 'POST',
        headers: { ...serviceHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ endpoint: s.endpoint, user_id: user.id, sub: { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } } }),
      });
      if (!r.ok) throw new Error('subscribe ' + r.status);
      return res.status(200).json({ ok: true });
    }
    if (b.action === 'unsubscribe') {
      if (typeof b.endpoint !== 'string') return res.status(400).json({ error: 'Abonnement invalide.' });
      const r = await fetch(T + '?endpoint=eq.' + encodeURIComponent(b.endpoint) + '&user_id=eq.' + encodeURIComponent(user.id), { method: 'DELETE', headers: serviceHeaders() });
      if (!r.ok) throw new Error('unsubscribe ' + r.status);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Demande inconnue.' });
  } catch (e) {
    console.error('push error:', e);
    return res.status(500).json({ error: 'Impossible de modifier les rappels pour le moment. Réessaie.' });
  }
};
