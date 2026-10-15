// [FICHIER] : frontend/src/components/MerchantDashboard.jsx
// [RÔLE] : dashboard marchand — création et suivi des liens de paiement.
// [À FAIRE PAR L'ÉQUIPE] :
// - Formulaire : montant FCFA, description, numéro Wave / Orange Money, provider
// - Appeler POST /api/invoices -> afficher le lien de paiement + QR + bouton "Partager sur WhatsApp"
// - Lister les ventes avec statut (en attente / payé) via GET /api/invoices
// - Rafraîchir le statut en temps réel (polling ou SSE)
// [UI] : Tailwind CSS ; [FLUX] : marchand -> génère le lien -> le partage au client diaspora.
