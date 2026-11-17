// Informations publiques dont le site a besoin pour se connecter à Supabase.
// La clé « anon » / « publishable » est faite pour être publique. Ne jamais mettre la clé secrète ici.
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_ANON_KEY || '',
    contact: process.env.CONTACT_EMAIL || '',
    limites: {
      fiches: parseInt(process.env.DAILY_FICHES, 10) || 5,
      veilles: parseInt(process.env.DAILY_VEILLES, 10) || 10,
    },
  });
};
