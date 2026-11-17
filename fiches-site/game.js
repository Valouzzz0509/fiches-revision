// Points, série, pseudo et classement. Il faut être connecté.
const { configured, getUser, rpc } = require('../lib/auth');
const { award, verifierPseudo } = require('../lib/game');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  if (!configured()) return res.status(500).json({ error: 'Le site n’est pas encore configuré.' });
  let user = null;
  try { user = await getUser(req); } catch (e) { console.error('auth error:', e); }
  if (!user) return res.status(401).json({ error: 'Connecte-toi pour continuer.' });

  const b = (req.body && typeof req.body === 'object') ? req.body : {};
  try {
    if (b.action === 'state') {
      return res.status(200).json({ state: await rpc('game_state', { p_user: user.id }) });
    }
    if (b.action === 'board') {
      const [state, board] = await Promise.all([rpc('game_state', { p_user: user.id }), rpc('leaderboard', { p_limit: 20 })]);
      return res.status(200).json({ state, board });
    }
    if (b.action === 'activity') {
      if (b.kind !== 'card' && b.kind !== 'quiz') return res.status(400).json({ error: 'Activité inconnue.' });
      const g = await award(user.id, b.kind, b.n);
      return res.status(200).json({ game: g });
    }
    if (b.action === 'pseudo') {
      const pseudo = typeof b.pseudo === 'string' ? b.pseudo.trim() : '';
      const ranking = !!b.ranking && !!pseudo;
      if (pseudo) { const err = verifierPseudo(pseudo); if (err) return res.status(400).json({ error: err }); }
      if (b.ranking && !pseudo) return res.status(400).json({ error: 'Choisis un pseudo pour apparaître dans le classement.' });
      const r = await rpc('set_profile', { p_user: user.id, p_pseudo: pseudo || null, p_ranking: ranking });
      if (r === 'pris') return res.status(409).json({ error: 'Ce pseudo est déjà pris. Choisis-en un autre.' });
      return res.status(200).json({ state: await rpc('game_state', { p_user: user.id }) });
    }
    return res.status(400).json({ error: 'Demande inconnue.' });
  } catch (e) {
    console.error('game error:', e);
    return res.status(500).json({ error: 'Une erreur est survenue. Réessaie dans un instant.' });
  }
};
