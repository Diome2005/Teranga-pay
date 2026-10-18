// [FICHIER] : frontend/src/services/api.js
// [RÔLE] : couche d'accès API centralisée (axios) — seul point d'appel réseau du frontend.
// [FLUX] : le dashboard marchand crée/lit les liens de paiement ; le guichet client
//          suit le statut. En dev, baseURL = "/api" est proxifié par Vite vers le backend (:5000).

import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// Jeton de session (Bearer) pour les routes marchand protégées.
function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Créer un lien de paiement marchand (protégé : jeton requis)
export async function createPaymentLink(payload, token) {
  const { data } = await api.post("/invoices", payload, { headers: authHeaders(token) });
  return data;
}

// Lister les liens DU MARCHAND connecté (protégé : jeton requis)
export async function listPaymentLinks(params, token) {
  const { data } = await api.get("/invoices", { params, headers: authHeaders(token) });
  return data;
}

// Activité récente du portefeuille BTC du marchand (dépôts / paiements).
// Proxy backend vers GET /api/transactions de Bitnob. Protégé : jeton requis.
export async function listWalletTransactions(token, params) {
  const { data } = await api.get("/wallet/transactions", {
    params,
    headers: authHeaders(token),
  });
  return data;
}

// Détail d'un lien (page checkout client)
export async function getPaymentLink(id) {
  const { data } = await api.get(`/invoices/${id}`);
  return data;
}

// Statut d'un lien (polling)
export async function getPaymentStatus(id) {
  const { data } = await api.get(`/invoices/${id}/status`);
  return data;
}

// Avis client après paiement : note 1-5 + commentaire optionnel (route publique).
export async function sendFeedback(id, payload) {
  const { data } = await api.post(`/invoices/${id}/feedback`, payload);
  return data;
}

// --- Étape 6 : auth marchand (email + mot de passe, et OTP passwordless) ---

// Crée un compte marchand (email + mot de passe + numéro Mobile Money)
export async function register(payload) {
  const { data } = await api.post("/auth/register", payload);
  return data;
}

// Connexion par email + mot de passe → session (jeton)
export async function login(payload) {
  const { data } = await api.post("/auth/login", payload);
  return data;
}

// Demande un code OTP pour un numéro Mobile Money
export async function requestOtp(payload) {
  const { data } = await api.post("/auth/otp", payload);
  return data;
}

// Vérifie le code OTP et renvoie une session (jeton)
export async function verifyOtp(payload) {
  const { data } = await api.post("/auth/otp/verify", payload);
  return data;
}

// --- Étape 6 : profil marchand (protégé par jeton) ---

export async function getMerchant(token) {
  const { data } = await api.get("/merchants/me", { headers: authHeaders(token) });
  return data;
}

export async function updateMerchant(token, payload) {
  const { data } = await api.put("/merchants/me", payload, { headers: authHeaders(token) });
  return data;
}

// Simule le paiement Lightning d'une facture (sandbox Bitnob) — le webhook
// deposit.success déclenche ensuite la liquidation réelle vers le Mobile Money.
// Réservé au marchand propriétaire de la facture (jeton requis).
export async function simulateInvoice(id, token) {
  const { data } = await api.post(`/invoices/${id}/simulate-card`, {}, { headers: authHeaders(token) });
  return data;
}

export default api;
