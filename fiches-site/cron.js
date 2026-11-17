// Envoie chaque jour un rappel aux personnes qui l'ont activé et n'ont pas encore révisé.
// Appelé automatiquement par Vercel (voir vercel.json). Protégé par CRON_SECRET.
const webpush = require('web-push');
const { base, serviceHeaders, configured, rpc } = require('../lib/auth');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET || '';
  const h = (req.headers && (req.headers.authorization || '')) || '';
  if (!secret || h !== 'Bearer ' + secret) return res.status(401).json({ error: 'Non autorisé.' });
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!configured() || !pub || !priv) return res.status(200).json({ skipped: 'rappels non configurés' });

  try {
    webpush.setVapidDetails('mailto:' + (process.env.CONTACT_EMAIL || 'contact@example.com'), pub, priv);
    const targets = await rpc('reminder_targets', {});
    let sent = 0, removed = 0, failed = 0;
    for (let i = 0; i < targets.length; i += 20) {
      await Promise.all(targets.slice(i, i + 20).map(async (t) => {
        const n = t.streak || 0;
        const payload = JSON.stringify({
          title: 'Carnet',
          body: n > 0 ? 'Ta série de ' + n + (n > 1 ? ' jours' : ' jour') + ' est en jeu. Révise 5 minutes pour la garder.' : 'Un petit quiz pour te mettre dans le bain ?',
          url: '/progres.html',
        });
        try { await webpush.sendNotification(t.sub, payload, { TTL: 6 * 3600 }); sent++; }
        catch (e) {
          if (e && (e.statusCode === 404 || e.statusCode === 410)) {
            removed++;
            await fetch(base() + '/rest/v1/push_subs?endpoint=eq.' + encodeURIComponent(t.endpoint), { method: 'DELETE', headers: serviceHeaders() }).catch(() => {});
          } else { failed++; console.error('push error:', e && e.statusCode); }
        }
      }));
    }
    return res.status(200).json({ targets: targets.length, sent, removed, failed });
  } catch (e) {
    console.error('cron error:', e);
    return res.status(500).json({ error: 'Erreur.' });
  }
};
