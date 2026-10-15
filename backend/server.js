// [FICHIER] : backend/server.js
// [RÔLE] : point d'entrée du backend Express — API du PSP marchand Teranga Pay.
// [À FAIRE PAR L'ÉQUIPE] :
// - Charger dotenv et créer l'application Express
// - Activer CORS (autoriser FRONTEND_URL) et express.json()
// - Monter les routes : /api/invoices et /api/webhooks
// - Exposer GET /api/health (ping de disponibilité)
// - Créer le store en mémoire des liens de paiement (Map) accessible aux routes
// - Démarrer le serveur sur process.env.PORT (défaut 5000)
// [FLUX] : reçoit les créations de liens (dashboard marchand) et les webhooks Bitnob (charge.success).
