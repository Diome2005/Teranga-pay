// [FICHIER] : frontend/src/components/CheckoutPage.jsx
// [RÔLE] : page publique client diaspora (aucune inscription requise).
// [À FAIRE PAR L'ÉQUIPE] :
// - Charger la facture via GET /api/invoices/:id
// - Afficher le montant FCFA + la description + le nom du marchand
// - Afficher le QR code Lightning (qrcode.react) à partir du BOLT11
// - Bouton "Payer par Carte / Apple Pay"
// - Polling du statut -> ouvrir ReceiptModal quand le paiement est confirmé
// [FLUX] : client paie -> Bitnob -> webhook -> statut "paid" affiché.
