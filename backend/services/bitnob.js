// [FICHIER] : backend/services/bitnob.js
// [RÔLE] : client unique d'intégration de l'API Bitnob (Sandbox).
// [À FAIRE PAR L'ÉQUIPE] :
// - Authentification HMAC-SHA256 (en-têtes X-Auth-Client / X-Auth-Timestamp / X-Auth-Nonce / X-Auth-Signature)
// - createLightningInvoice({ amountXOF, description, reference }) -> facture BOLT11
// - getInvoice(id) -> statut d'une facture (pending / paid / expired)
// - createMobileMoneyPayout({ amountXOF, phone, provider, reference }) -> reversement Wave / Orange Money
// - Conversion FCFA -> satoshis (variable SATS_PER_XOF)
// [FLUX] : appelé par routes/invoices.js (création facture) et routes/webhooks.js (payout après paiement).
