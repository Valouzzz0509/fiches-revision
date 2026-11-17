/* Carnet – code partagé par toutes les pages */
const SITE = 'Carnet';
const $ = id => document.getElementById(id);
function el(tag, txt, cls) {
  const e = document.createElement(tag);
  if (txt != null) e.textContent = txt;
  if (cls) e.className = cls;
  return e;
}
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pref(k, v) {
  try { if (v === undefined) return localStorage.getItem('p_' + k) || ''; localStorage.setItem('p_' + k, v); } catch (e) {}
  return '';
}
function colorIndex(str) {
  let h = 0; for (const c of String(str || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 4;
}
function newId() { return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ================= connexion (Supabase) ================= */
let CONFIG = null, _sbp = null;
function sb() {
  if (_sbp) return _sbp;
  _sbp = (async () => {
    if (!window.supabase) throw new Error('Le service de connexion n’a pas pu se charger. Vérifie ta connexion internet puis recharge la page.');
    let c;
    try { const r = await fetch('/api/config'); c = await r.json(); }
    catch (e) { throw new Error('Impossible de joindre le serveur. Réessaie dans un instant.'); }
    if (!c.url || !c.key) throw new Error('Le site n’est pas encore configuré.');
    CONFIG = c;
    return window.supabase.createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  })();
  _sbp.catch(() => { _sbp = null; });
  return _sbp;
}
async function getSession() {
  try { const c = await sb(); const { data } = await c.auth.getSession(); return data.session || null; }
  catch (e) { return null; }
}
/* Pages réservées aux personnes connectées : cache la page, puis renvoie vers la connexion si besoin. */
async function gate() {
  const m = document.querySelector('main');
  if (m) m.classList.add('hide');
  const s = await getSession();
  if (!s) {
    pref('in', '');
    const here = (location.pathname.split('/').pop() || 'index.html') + location.search + location.hash;
    location.replace('connexion.html?next=' + encodeURIComponent(here));
    return null;
  }
  pref('in', '1');
  if (m) m.classList.remove('hide');
  return s;
}
async function logout() {
  try { const c = await sb(); await c.auth.signOut(); } catch (e) {}
  pref('in', '');
  location.href = 'index.html';
}
/* Appel d'une fonction du serveur avec le jeton de la personne connectée */
async function api(path, body) {
  const s = await getSession();
  if (!s) { pref('in', ''); throw Object.assign(new Error('Ta session a expiré. Reconnecte-toi.'), { status: 401 }); }
  let r;
  try {
    r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token }, body: JSON.stringify(body || {}) });
  } catch (e) { throw new Error('Impossible de joindre le serveur. Vérifie ta connexion internet.'); }
  const d = await r.json().catch(() => ({ error: 'Réponse invalide du serveur.' }));
  if (r.status === 401) { pref('in', ''); throw Object.assign(new Error('Ta session a expiré. Reconnecte-toi.'), { status: 401 }); }
  if (!r.ok) throw Object.assign(new Error(d.error || 'Erreur serveur'), { status: r.status });
  return d;
}

/* ---- anciennes fiches enregistrées sur l'appareil (avant les comptes) ---- */
const Local = {
  KEY: 'fiches',
  all() {
    let l = [];
    try { l = JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) {}
    if (!Array.isArray(l)) l = [];
    l.forEach((d, i) => { if (!d.id) d.id = 'l' + (Date.now() - i).toString(36) + i; if (!d.createdAt) d.createdAt = Date.now() - i * 1000; });
    return l;
  },
  write(l) { try { localStorage.setItem(this.KEY, JSON.stringify(l)); } catch (e) {} },
  add(d) { this.write([d].concat(this.all().filter(x => x.id !== d.id))); },
  clear() { try { localStorage.removeItem(this.KEY); } catch (e) {} }
};

/* ---- fiches enregistrées sur le compte ---- */
const Store = {
  async all() {
    const c = await sb();
    const { data, error } = await c.from('fiches').select('data').order('created_at', { ascending: false }).limit(300);
    if (error) throw error;
    return data.map(r => r.data);
  },
  async get(id) {
    try {
      const c = await sb();
      const { data, error } = await c.from('fiches').select('data').eq('id', id).maybeSingle();
      if (!error && data) return data.data;
    } catch (e) {}
    return Local.all().find(d => d.id === id) || null;
  },
  async add(d) {
    const c = await sb(); const s = await getSession();
    const { error } = await c.from('fiches').insert({ user_id: s.user.id, id: d.id, data: d });
    if (error) throw error;
  },
  async update(d) {
    const c = await sb();
    const { error } = await c.from('fiches').update({ data: d }).eq('id', d.id);
    if (error) throw error;
  },
  async remove(id) {
    const c = await sb();
    const { error } = await c.from('fiches').delete().eq('id', id);
    if (error) throw error;
  },
  /* ajoute au compte les fiches de l'appareil, puis les retire de l'appareil */
  async importLocal() {
    const list = Local.all(); if (!list.length) return 0;
    const c = await sb(); const s = await getSession();
    const rows = list.map(d => ({ user_id: s.user.id, id: d.id, data: d }));
    const { error } = await c.from('fiches').upsert(rows, { onConflict: 'user_id,id', ignoreDuplicates: true });
    if (error) throw error;
    Local.clear();
    return list.length;
  }
};

/* ================= en-tête et pied de page ================= */
const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#2c43d0"/><rect x="15" y="12" width="34" height="40" rx="4" fill="#fff"/><rect x="21" y="19" width="22" height="7" fill="#ffde59"/><path d="M21 33h22M21 40h22M21 47h14" stroke="#2c43d0" stroke-width="2.6" stroke-linecap="round"/><path d="M19 12v40" stroke="#e5574f" stroke-width="2"/></svg>';
function chrome(active) {
  const inn = !!pref('in');
  const cur = n => active === n ? ' aria-current="page"' : '';
  const hd = $('site-header');
  if (hd) hd.innerHTML =
    '<header class="top"><div class="wrap bar">' +
    '<a class="brand" href="index.html">' + LOGO + '<span>' + SITE + '</span></a>' +
    '<nav aria-label="Navigation principale">' +
    (inn ? '<a href="fiches.html"' + cur('fiches') + '>Mes fiches</a>' : '<a href="connexion.html"' + cur('connexion') + '>Se connecter</a>') +
    '<a class="btn sm" href="creer.html"' + cur('creer') + '>Créer une fiche</a>' +
    '</nav></div></header>';
  const ft = $('site-footer');
  if (ft) ft.innerHTML =
    '<footer class="foot"><div class="wrap">' +
    '<div><b>' + SITE + '</b><p>Des fiches de révision, des cartes mémo et un quiz à partir d’une photo de ton cours.</p></div>' +
    '<nav aria-label="Pied de page"><a href="index.html">Accueil</a><a href="creer.html">Créer une fiche</a>' +
    (inn ? '<a href="fiches.html">Mes fiches</a><a href="compte.html">Mon compte</a>' : '<a href="connexion.html">Se connecter</a>') +
    '<a href="confidentialite.html">Confidentialité</a></nav>' +
    '<p class="small">' + SITE + ' utilise une IA, qui peut se tromper. Relis toujours ta fiche avant de l’apprendre. ' +
    'Ton adresse email et tes fiches sont enregistrées sur ton compte pour que tu les retrouves sur tous tes appareils. ' +
    'Tes photos sont envoyées à l’IA pour créer la fiche et ne sont pas conservées par le site.</p>' +
    '</div></footer>';
  /* on vérifie la vraie situation, et on corrige l'en-tête si elle a changé */
  getSession().then(s => {
    const real = !!s;
    if (real !== inn) { pref('in', real ? '1' : ''); chrome(active); }
  });
}

/* ================= rendu d'une fiche (à l'écran et pour le PDF) ================= */
function buildFiche(d, withButtons, onDownload) {
  const f = el('div', null, 'card fiche');
  const head = el('header', null, 'fh');
  const chips = el('div', null, 'chips');
  if (d.matiere) chips.appendChild(el('span', d.matiere));
  if (d.niveau) chips.appendChild(el('span', d.niveau));
  chips.appendChild(el('span', new Date(d.createdAt || Date.now()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })));
  head.append(chips, el('h2', d.title));
  f.appendChild(head);
  if (d.keywords && d.keywords.length) {
    const kb = el('div', null, 'kwbox'); kb.appendChild(el('strong', 'À retenir'));
    const k = el('div', null, 'kw'); d.keywords.forEach(w => k.appendChild(el('span', w)));
    kb.appendChild(k); f.appendChild(kb);
  }
  (d.sections || []).forEach((s, i) => {
    const sec = el('section', null, 'sec c' + (i % 4));
    sec.appendChild(el('h3', s.heading));
    const ul = el('ul'); (s.points || []).forEach(p => ul.appendChild(el('li', p)));
    sec.appendChild(ul); f.appendChild(sec);
  });
  if (withButtons) {
    const bar = el('div', null, 'dl');
    const b1 = el('button', 'Télécharger la fiche (PDF)'); b1.onclick = () => onDownload('fiche');
    const b2 = el('button', 'Télécharger les cartes (PDF)', 'ghost'); b2.onclick = () => onDownload('cards');
    bar.append(b1, b2); f.appendChild(bar);
  }
  return f;
}

/* ---- veille de contrôle : version courte à relire en 5 minutes ---- */
function veilleMinutes(x) {
  const words = []
    .concat(x.essentiel || [], (x.par_coeur || []).map(p => p.terme + ' ' + p.def), x.pieges || [])
    .join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 170));
}
function buildVeille(d, forPrint) {
  const x = d.express;
  const f = el('div', null, 'card fiche veille');
  const head = el('header', null, 'fh');
  const chips = el('div', null, 'chips');
  chips.appendChild(el('span', 'Veille de contrôle'));
  if (d.matiere) chips.appendChild(el('span', d.matiere));
  chips.appendChild(el('span', '≈ ' + veilleMinutes(x) + ' min de lecture'));
  head.append(chips, el('h2', d.title));
  f.appendChild(head);

  const sec = (titre, cls) => { const s = el('section', null, 'sec ' + cls); s.appendChild(el('h3', titre)); f.appendChild(s); return s; };

  const s1 = sec('L’essentiel', 'c0');
  const ul = el('ul'); x.essentiel.forEach(t => ul.appendChild(el('li', t))); s1.appendChild(ul);

  const s2 = sec('À savoir par cœur', 'c2');
  const dl = el('dl', null, 'par');
  x.par_coeur.forEach(p => { const row = el('div'); row.append(el('dt', p.terme), el('dd', p.def)); dl.appendChild(row); });
  s2.appendChild(dl);

  if (x.pieges && x.pieges.length) {
    const s3 = sec('Les pièges à éviter', 'c1');
    const u3 = el('ul'); x.pieges.forEach(t => u3.appendChild(el('li', t))); s3.appendChild(u3);
  }
  if (x.test && x.test.length) {
    const s4 = sec('Teste-toi', 'c3');
    if (forPrint) {
      const ol = el('ol', null, 'qa');
      x.test.forEach(t => { const li = el('li'); li.append(el('b', t.q), el('span', ' Réponse : ' + t.a)); ol.appendChild(li); });
      s4.appendChild(ol);
    } else {
      s4.appendChild(el('p', 'Réponds dans ta tête, puis touche la question pour vérifier.', 'hint2'));
      x.test.forEach(t => {
        const det = el('details', null, 'q');
        det.appendChild(el('summary', t.q));
        det.appendChild(el('p', t.a));
        s4.appendChild(det);
      });
    }
  }
  return f;
}

function printDeck(d, mode) {
  let pr = $('pr'); if (!pr) { pr = el('div'); pr.id = 'pr'; document.body.appendChild(pr); }
  pr.textContent = '';
  if (mode === 'fiche') {
    pr.appendChild(buildFiche(d, false));
  } else if (mode === 'veille') {
    pr.appendChild(buildVeille(d, true));
  } else {
    pr.appendChild(el('h2', d.title + ' – cartes mémo', 'prt'));
    const g = el('div', null, 'pgrid');
    (d.cards || []).forEach(c => { const x = el('div', null, 'pc'); x.appendChild(el('b', c.q)); x.appendChild(el('span', c.a)); g.appendChild(x); });
    pr.appendChild(g);
  }
  const old = document.title;
  document.title = (d.title || 'fiche').replace(/[\\/:*?"<>|]/g, '') + (mode === 'cards' ? ' - cartes' : mode === 'veille' ? ' - veille' : '');
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); document.title = old; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 60);
}
