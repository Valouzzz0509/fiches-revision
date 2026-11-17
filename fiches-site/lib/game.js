// Points, série de jours, pseudos : règles du jeu côté serveur (le navigateur ne décide jamais des points).
const { rpc } = require('./auth');

// points gagnés, et plafond par jour pour chaque type d'activité
const REGLES = {
  fiche:  { pts: 20, cap: 200 },   // une fiche créée
  veille: { pts: 10, cap: 100 },   // une veille de contrôle créée
  card:   { pts: 1,  cap: 40 },    // une carte « Je savais »
  quiz:   { pts: 2,  cap: 40 },    // une bonne réponse au quiz
};

// Ajoute des points. Ne fait jamais échouer la requête principale : renvoie null en cas de souci.
async function award(userId, kind, n) {
  const r = REGLES[kind];
  if (!r) return null;
  const count = Math.max(0, Math.min(parseInt(n, 10) || 1, 50));
  try { return await rpc('award_points', { p_user: userId, p_kind: kind, p_pts: r.pts * count, p_cap: r.cap }); }
  catch (e) { console.error('award error:', e); return null; }
}

// ---- pseudos (visibles par les autres dans le classement) ----
const RESERVES = ['admin', 'administrateur', 'moderateur', 'carnet', 'claude', 'anthropic', 'support', 'staff', 'officiel'];
// mots refusés (comparés après nettoyage : minuscules, sans accents, chiffres « leet » remplacés)
const INTERDITS_LONGS = ['putain', 'salope', 'salop', 'connard', 'connasse', 'encule', 'merde', 'nazi', 'hitler', 'negre', 'nique', 'pedo', 'pedophile', 'viol', 'bougnoul', 'youpin', 'tapette', 'chatte', 'couille', 'suicide', 'terroris', 'daesh', 'pute', 'bite', 'sexe', 'porno', 'batard', 'enfoire'];
const INTERDITS_COURTS = ['pd', 'ntm', 'fdp', 'con', 'cul', 'tg', 'sida'];

function nettoyer(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/@/g, 'a')
    .replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
}

// Renvoie un message d'erreur (en français), ou '' si le pseudo est accepté.
function verifierPseudo(p) {
  if (typeof p !== 'string' || !/^[A-Za-z0-9_-]{3,16}$/.test(p)) return 'Le pseudo doit faire 3 à 16 caractères : lettres, chiffres, _ ou -.';
  if (/\d{5,}/.test(p)) return 'Évite les longs numéros dans ton pseudo.';
  const n = nettoyer(p);
  const refuse = 'Ce pseudo n’est pas accepté. Choisis-en un autre.';
  if (RESERVES.some((w) => n.includes(w))) return refuse;
  if (INTERDITS_LONGS.some((w) => n.includes(nettoyer(w)))) return refuse;
  if (INTERDITS_COURTS.some((w) => n === w)) return refuse;
  return '';
}

module.exports = { REGLES, award, verifierPseudo, nettoyer };
