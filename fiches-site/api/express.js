// Fonction serverless Vercel : crée la « veille de contrôle » (version courte) à partir d'une fiche existante.
// Elle n'utilise que le texte de la fiche, pas les photos : c'est rapide et peu coûteux.
const { guard } = require('../lib/auth');
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const arr = (v) => (Array.isArray(v) ? v : []);

function fichePourPrompt(f) {
  let t = 'Titre : ' + str(f.title, 140) + '\n\n';
  arr(f.sections).slice(0, 9).forEach((s) => {
    t += '## ' + str(s && s.heading, 140) + '\n';
    arr(s && s.points).slice(0, 10).forEach((p) => { t += '- ' + str(p, 500) + '\n'; });
    t += '\n';
  });
  const kw = arr(f.keywords).slice(0, 14).map((k) => str(k, 60)).filter(Boolean);
  if (kw.length) t += 'Mots-clés : ' + kw.join(', ') + '\n\n';
  const cards = arr(f.cards).slice(0, 20).filter((c) => c && c.q && c.a);
  if (cards.length) {
    t += 'Cartes mémo :\n';
    cards.forEach((c) => { t += '- ' + str(c.q, 300) + ' → ' + str(c.a, 400) + '\n'; });
  }
  return t;
}

function buildPrompt({ fiche, matiere, niveau }) {
  const m = str(matiere, 80);
  const n = str(niveau, 40);
  return `Tu es un excellent professeur${m ? ' de ' + m : ''} qui aide un élève${n ? ' (' + n + ')' : ''} à relire son cours la veille d'un contrôle.
Voici la fiche de révision de l'élève. À partir d'elle UNIQUEMENT (n'ajoute aucune information qui n'y figure pas), crée une version « veille de contrôle » qu'on lit en 5 minutes.

Réponds UNIQUEMENT par un JSON valide, sans markdown et sans texte avant ou après, de cette forme :
{"essentiel":["…"],"par_coeur":[{"terme":"…","def":"…"}],"pieges":["…"],"test":[{"q":"…","a":"…"}]}

- essentiel : 5 à 7 phrases courtes (20 mots maximum chacune), les idées qui comptent le plus, dans l'ordre logique du cours.
- par_coeur : 6 à 10 éléments à connaître exactement (définition, date, formule, nom, auteur, étape…). « terme » est court, « def » tient en une phrase courte. Garde les formules, les dates et les noms exactement comme dans la fiche.
- pieges : 2 à 4 confusions ou oublis fréquents, UNIQUEMENT s'ils découlent de la fiche (par exemple deux notions proches à ne pas mélanger). Si la fiche n'en donne aucun, renvoie une liste vide.
- test : 5 questions rapides pour se tester sans regarder le cours, chacune avec une réponse très courte.
- Écris en français, avec des phrases qu'on peut mémoriser.

FICHE :
${fichePourPrompt(fiche)}`;
}

function clean(d) {
  const essentiel = arr(d && d.essentiel).map((x) => str(x, 300)).filter(Boolean).slice(0, 9);
  const par_coeur = arr(d && d.par_coeur)
    .map((x) => ({ terme: str(x && x.terme, 120), def: str(x && x.def, 300) }))
    .filter((x) => x.terme && x.def)
    .slice(0, 12);
  const pieges = arr(d && d.pieges).map((x) => str(x, 300)).filter(Boolean).slice(0, 5);
  const test = arr(d && d.test)
    .map((x) => ({ q: str(x && x.q, 300), a: str(x && x.a, 300) }))
    .filter((x) => x.q && x.a)
    .slice(0, 8);
  if (!essentiel.length || !par_coeur.length) throw new Error('veille incomplète');
  return { essentiel, par_coeur, pieges, test, createdAt: Date.now() };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  const { fiche, matiere = '', niveau = '' } = req.body || {};

  if (!fiche || typeof fiche !== 'object' || !arr(fiche.sections).length)
    return res.status(400).json({ error: 'Fiche manquante.' });
  if (JSON.stringify(fiche).length > 40000)
    return res.status(400).json({ error: 'Fiche trop longue.' });

  const g = await guard(req, res, 'veille');   // vérifie le compte et la limite du jour
  if (!g) return;

  let stop = '', raw = '';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        messages: [{ role: 'user', content: buildPrompt({ fiche, matiere, niveau }) }],
      }),
    });
    const j = await r.json();
    if (!r.ok) { await g.refund(); return res.status(502).json({ error: 'Erreur IA : ' + ((j.error && j.error.message) || r.status) }); }
    stop = j.stop_reason || '';
    raw = (j.content || []).map((b) => b.text || '').join('');
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a < 0 || b < 0) throw new Error('aucun JSON dans la réponse');
    return res.status(200).json(clean(JSON.parse(raw.slice(a, b + 1))));
  } catch (e) {
    console.error('express error:', e, 'stop:', stop, 'raw:', raw.slice(0, 500));
    await g.refund();
    return res.status(500).json({ error: 'Impossible de préparer la veille (' + e.message + (stop ? ', fin : ' + stop : '') + '). Réessaie.' });
  }
};

module.exports._test = { buildPrompt, clean };
