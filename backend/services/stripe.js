// [FICHIER] : backend/services/stripe.js
// [RÔLE] : paiement par carte / Apple Pay via Stripe Checkout (alternative au Lightning).
// [CHOIX] : appel REST direct (axios déjà présent) -> aucune dépendance native ajoutée,
//   zéro risque de build cassé. Les clés sont optionnelles : sans STRIPE_SECRET_KEY le
//   service est simplement "non configuré" et le frontend garde le mode démo.
// [WEBHOOK] : signature Stripe = `t=<ts>,v1=<hmac>` avec HMAC-SHA256(`${t}.${payload}`).
//   Comparaison à temps constant (timingSafeEqual).

const crypto = require("crypto");
const axios = require("axios");

const STRIPE_API = process.env.STRIPE_API_BASE || "https://api.stripe.com";
const SECRET = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

function isConfigured() {
  return Boolean(SECRET);
}

// Poste un formulaire urlencoded vers l'API Stripe (convention Stripe).
async function stripePost(path, params) {
  const body = new URLSearchParams();
  const append = (key, value) => {
    if (value === undefined || value === null) return;
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) append(`${key}[${k}]`, v);
      return;
    }
    body.append(key, String(value));
  };
  for (const [k, v] of Object.entries(params)) append(k, v);

  const { data } = await axios.post(`${STRIPE_API}${path}`, body.toString(), {
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 15000,
  });
  return data;
}

// Crée une session Stripe Checkout. L'objet facture est référencé via metadata +
// client_reference_id pour être retrouvé au webhook.
// NB : XOF est une devise sans décimale -> unit_amount = montant entier en FCFA.
async function createCheckoutSession({
  amount,
  description,
  reference,
  successUrl,
  cancelUrl,
  metadata = {},
}) {
  if (!isConfigured()) {
    throw new Error("Stripe non configuré (STRIPE_SECRET_KEY manquant).");
  }
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    throw new Error("createCheckoutSession : montant invalide.");
  }

  const data = await stripePost("/v1/checkout/sessions", {
    mode: "payment",
    client_reference_id: reference,
    success_url: successUrl || `${process.env.PUBLIC_URL || ""}/?pay=${reference}&paid=1`,
    cancel_url: cancelUrl || `${process.env.PUBLIC_URL || ""}/?pay=${reference}`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "xof",
          unit_amount: Math.round(Number(amount)),
          product_data: { name: description || "Paiement Teranga Pay" },
        },
      },
    ],
    metadata,
  });

  return {
    id: data.id,
    url: data.url,
    status: data.status,
    amountTotal: data.amount_total,
    currency: data.currency,
  };
}

// Vérifie la signature d'un webhook Stripe.
// Retourne true/false, ou null si aucun secret n'est configuré (mode dev).
function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return null;

  const header = String(signatureHeader || "");
  const parts = {};
  for (const chunk of header.split(",")) {
    const idx = chunk.indexOf("=");
    if (idx < 0) continue;
    const k = chunk.slice(0, idx).trim();
    const v = chunk.slice(idx + 1).trim();
    (parts[k] = parts[k] || []).push(v);
  }

  const timestamp = parts.t && parts.t[0];
  const signatures = parts.v1 || [];
  if (!timestamp || signatures.length === 0) return false;

  // Rejette les signatures trop anciennes (replay > 5 min).
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (Number.isFinite(age) && age > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  return signatures.some((sig) => {
    const receivedBuf = Buffer.from(sig, "utf8");
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  });
}

module.exports = { STRIPE_API, isConfigured, createCheckoutSession, verifyWebhookSignature };
