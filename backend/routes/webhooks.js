// [FICHIER] : backend/routes/webhooks.js
// [RÔLE] : réception des webhooks Bitnob et déclenchement de la liquidation.
// [À FAIRE PAR L'ÉQUIPE] :
// - POST /bitnob : vérifier la signature, lire le type d'événement
// - Sur charge.success -> passer la facture en "paid" -> appeler createMobileMoneyPayout (Wave / Orange Money)
// - Gérer les événements payout (payouts.withdrawal.success / expired) pour mettre à jour payout_status
// - Répondre 200 rapidement ; traitement idempotent
// [FLUX] : Bitnob -> webhook -> payout FCFA vers le marchand -> statut mis à jour pour le dashboard.
