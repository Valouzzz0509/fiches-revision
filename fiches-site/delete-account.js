// Supprime le compte de la personne connectée et toutes ses fiches (suppression en cascade dans la base).
const { base, serviceHeaders, configured, getUser } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  if (!configured()) return res.status(500).json({ error: 'Le site n’est pas encore configuré.' });
  let user = null;
  try { user = await getUser(req); } catch (e) { console.error('auth error:', e); }
  if (!user) return res.status(401).json({ error: 'Connecte-toi pour continuer.' });
  try {
    const r = await fetch(base() + '/auth/v1/admin/users/' + encodeURIComponent(user.id), { method: 'DELETE', headers: serviceHeaders() });
    if (!r.ok) throw new Error('admin delete ' + r.status);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('delete-account error:', e);
    return res.status(500).json({ error: 'Impossible de supprimer le compte pour le moment. Réessaie.' });
  }
};
