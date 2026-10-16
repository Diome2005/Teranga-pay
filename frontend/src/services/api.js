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

// Créer un lien de paiement marchand
export async function createPaymentLink(payload) {
  const { data } = await api.post("/invoices", payload);
  return data;
}

// Lister les liens d'un marchand (filtre optionnel par numéro)
export async function listPaymentLinks(params) {
  const { data } = await api.get("/invoices", { params });
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

// (Démo) encaisser sans carte réelle
export async function simulateCardPayment(id) {
  const { data } = await api.post(`/invoices/${id}/simulate-card`);
  return data;
}

export default api;
