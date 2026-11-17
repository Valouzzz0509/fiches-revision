// Informations publiques dont le site a besoin pour se connecter à Supabase.
// La clé « anon » / « publishable » est faite pour être publique. Ne jamais mettre la clé secrète ici.
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_ANON_KEY || '',
    contact: process.env.CONTACT_EMAIL || '',
    editeur: process.env.SITE_EDITOR || '',   // ex. « Prénom Nom, micro-entrepreneur, SIRET … » (mentions légales)
    vapid: process.env.VAPID_PUBLIC_KEY || '',   // clé publique des rappels (faite pour être publique)
    limites: {
      fiches: parseInt(process.env.DAILY_FICHES, 10) || 5,
      veilles: parseInt(process.env.DAILY_VEILLES, 10) || 10,
    },
    plus: {
      dispo: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID),
      prix: process.env.PLUS_PRICE_LABEL || '4,99 €',
      fiches: parseInt(process.env.DAILY_FICHES_PLUS, 10) || 30,
      veilles: parseInt(process.env.DAILY_VEILLES_PLUS, 10) || 60,
    },
  });
};
