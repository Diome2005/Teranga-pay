// [FICHIER] : backend/routes/invoices.js
// [RÔLE] : routes de gestion des liens / factures de paiement marchand.
// [À FAIRE PAR L'ÉQUIPE] :
// - POST / : lire merchantPhone, provider, amountXOF, description depuis le body
//   -> appeler bitnob.createLightningInvoice -> enregistrer la transaction (store) -> renvoyer la facture + checkout_url
// - GET / : lister les liens de paiement (dashboard marchand)
// - GET /:id : renvoyer le statut d'un lien (page checkout client diaspora)
// - POST /:id/simulate-card : (démo) déclencher charge.success sans carte réelle
// [FLUX] : le dashboard crée le lien ; la page /pay/:id consomme GET /:id pour suivre le statut.
