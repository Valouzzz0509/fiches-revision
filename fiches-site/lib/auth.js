// Vérifie qui fait la demande (compte Supabase) et applique les limites par jour.
// Utilisé par api/generate.js et api/express.js.

const base = () => String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : d; };

// Les nouvelles clés « secret » (sb_secret_…) se passent dans apikey seulement ;
// les anciennes clés « service_role » (JWT, eyJ…) se passent aussi en Bearer.
function serviceHeaders() {
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  const h = { apikey: key, 'content-type': 'application/json' };
  if (key.startsWith('eyJ')) h.Authorization = 'Bearer ' + key;
  return h;
}

function configured() {
  return !!(base() && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_KEY);
}

// Renvoie { id, email } si le jeton envoyé par le site est valide, sinon null.
async function getUser(req) {
  const h = (req && req.headers) || {};
  const m = /^Bearer\s+(.+)$/i.exec(h.authorization || h.Authorization || '');
  if (!m) return null;
  const r = await fetch(base() + '/auth/v1/user', {
    headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + m[1] },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? { id: u.id, email: u.email } : null;
}

async function rpc(name, args) {
  const r = await fetch(base() + '/rest/v1/rpc/' + name, { method: 'POST', headers: serviceHeaders(), body: JSON.stringify(args) });
  if (!r.ok) throw new Error('rpc ' + name + ' ' + r.status);
  return r.json();
}

const LIMITES = {
  fiche: () => num(process.env.DAILY_FICHES, 5),
  veille: () => num(process.env.DAILY_VEILLES, 10),
  global: () => num(process.env.DAILY_GLOBAL, 300),
};
// limites des abonné·e·s Carnet Plus
const LIMITES_PLUS = {
  fiche: () => num(process.env.DAILY_FICHES_PLUS, 30),
  veille: () => num(process.env.DAILY_VEILLES_PLUS, 60),
};
const LIBELLE = { fiche: 'fiches', veille: 'veilles de contrôle' };

// À appeler avant de consulter l'IA. Répond lui-même en cas de problème et renvoie null.
// Sinon renvoie { user, refund } : appeler refund() si la génération échoue, pour rendre l'essai.
async function guard(req, res, kind) {
  if (!configured()) { res.status(500).json({ error: 'Le site n’est pas encore configuré (connexion).' }); return null; }
  let user = null;
  try { user = await getUser(req); } catch (e) { console.error('auth error:', e); }
  if (!user) { res.status(401).json({ error: 'Connecte-toi pour continuer.' }); return null; }

  let plus = false;
  try { plus = !!(await rpc('is_plus', { p_user: user.id })); } catch (e) { console.error('plus error:', e); }
  const limite = plus ? LIMITES_PLUS[kind]() : LIMITES[kind]();
  let r;
  try {
    r = await rpc('consume_quota', { p_user: user.id, p_kind: kind, p_user_limit: limite, p_global_limit: LIMITES.global() });
  } catch (e) {
    console.error('quota error:', e);
    res.status(500).json({ error: 'Impossible de vérifier ta limite du jour. Réessaie.' });
    return null;
  }
  if (r === 'user') { res.status(429).json({ error: 'Tu as atteint ta limite de ' + limite + ' ' + LIBELLE[kind] + ' pour aujourd’hui. Reviens demain' + (plus ? '.' : ', ou passe à Carnet Plus pour en créer davantage.') }); return null; }
  if (r === 'global') { res.status(429).json({ error: 'Le site a atteint sa limite pour aujourd’hui. Réessaie demain.' }); return null; }
  return { user, refund: () => rpc('refund_quota', { p_user: user.id, p_kind: kind }).catch((e) => console.error('refund error:', e)) };
}

module.exports = { base, serviceHeaders, configured, getUser, rpc, guard, LIMITES, LIMITES_PLUS };
