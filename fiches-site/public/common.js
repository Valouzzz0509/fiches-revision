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

/* ---- stockage des fiches (dans le navigateur de la personne) ---- */
const Store = {
  KEY: 'fiches',
  _w(l) { try { localStorage.setItem(this.KEY, JSON.stringify(l)); } catch (e) {} },
  all() {
    let l = [];
    try { l = JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) {}
    if (!Array.isArray(l)) l = [];
    let changed = false;
    l.forEach((d, i) => {               // anciennes fiches : on leur donne un id et une date
      if (!d.id) { d.id = 'f' + (Date.now() - i).toString(36) + i; changed = true; }
      if (!d.createdAt) { d.createdAt = Date.now() - i * 1000; changed = true; }
    });
    if (changed) this._w(l);
    return l.slice().sort((a, b) => b.createdAt - a.createdAt);
  },
  get(id) { return this.all().find(d => d.id === id); },
  update(d) { this._w(this.all().map(x => x.id === d.id ? d : x)); },
  add(d) { this._w([d].concat(this.all()).slice(0, 60)); },
  remove(id) { this._w(this.all().filter(d => d.id !== id)); }
};
function pref(k, v) {
  try { if (v === undefined) return localStorage.getItem('p_' + k) || ''; localStorage.setItem('p_' + k, v); } catch (e) {}
  return '';
}
function colorIndex(str) {
  let h = 0; for (const c of String(str || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 4;
}

/* ---- en-tête et pied de page ---- */
const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#2c43d0"/><rect x="15" y="12" width="34" height="40" rx="4" fill="#fff"/><rect x="21" y="19" width="22" height="7" fill="#ffde59"/><path d="M21 33h22M21 40h22M21 47h14" stroke="#2c43d0" stroke-width="2.6" stroke-linecap="round"/><path d="M19 12v40" stroke="#e5574f" stroke-width="2"/></svg>';
function chrome(active) {
  const cur = n => active === n ? ' aria-current="page"' : '';
  const hd = $('site-header');
  if (hd) hd.innerHTML =
    '<header class="top"><div class="wrap bar">' +
    '<a class="brand" href="index.html">' + LOGO + '<span>' + SITE + '</span></a>' +
    '<nav aria-label="Navigation principale">' +
    '<a href="fiches.html"' + cur('fiches') + '>Mes fiches</a>' +
    '<a class="btn sm" href="creer.html"' + cur('creer') + '>Créer une fiche</a>' +
    '</nav></div></header>';
  const ft = $('site-footer');
  if (ft) ft.innerHTML =
    '<footer class="foot"><div class="wrap">' +
    '<div><b>' + SITE + '</b><p>Des fiches de révision, des cartes mémo et un quiz à partir d’une photo de ton cours.</p></div>' +
    '<nav aria-label="Pied de page"><a href="index.html">Accueil</a><a href="creer.html">Créer une fiche</a><a href="fiches.html">Mes fiches</a></nav>' +
    '<p class="small">' + SITE + ' utilise une IA, qui peut se tromper. Relis toujours ta fiche avant de l’apprendre. ' +
    'Tes photos sont envoyées à l’IA pour créer la fiche et ne sont pas conservées par le site. Tes fiches restent enregistrées sur ton appareil.</p>' +
    '</div></footer>';
}

/* ---- rendu d'une fiche (utilisé à l'écran et pour le PDF) ---- */
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
