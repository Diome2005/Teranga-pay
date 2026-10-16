// [FICHIER] : backend/server.js
// [RÔLE] : point d'entrée Express du backend Teranga Pay.
// [ÉTAPE 1] : serveur minimal — GET /health.
// [ÉTAPE 2] : GET /api/whoami — test d'authentification Bitnob.
// [ÉTAPE 3] : POST /api/invoices — crée un client (si besoin) + facture Lightning.
// [ÉTAPE 4] : POST /api/webhooks/bitnob — réception des notifications de paiement.
// [ÉTAPE 5] : liquidation Mobile Money — à la réception de
//   btc.lightning.received.success, payout FCFA automatique vers le numéro
//   du marchand (Wave / Orange Money / Free Money) via le flux payouts Bitnob.
// [ÉTAPE 6] : persistance (store JSON), auth passwordless (OTP) et paiement
//   par carte (Stripe Checkout) en alternative au Lightning.

require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const bitnob = require("./services/bitnobService");
const stripe = require("./services/stripe");
const auth = require("./services/auth");
const store = require("./services/store");

const app = express();

app.use(cors());
// On conserve le corps brut (Buffer) pour vérifier la signature du webhook.
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Extrait le statut + le détail d'une erreur Bitnob/axios.
function bitnobError(error) {
  const status = error.response?.status || 500;
  const details = error.response?.data || { message: error.message };
  return { status, details };
}

// Normalise un numéro sénégalais vers le format international attendu par
// les payouts Bitnob (ex. "771234567" -> "+221771234567").
function toInternationalPhone(phone) {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return raw;
  if (digits.startsWith("221")) return `+${digits}`;
  if (digits.length === 9) return `+221${digits}`;
  return raw;
}

// Registre des factures émises (clé : reference Bitnob) — [ÉTAPE 6] persistant.
// Sert au webhook à retrouver le numéro marchand, le provider et le montant XOF à
// liquidater. Survit au redémarrage grâce au store JSON (services/store.js).
const invoicesStore = store.collection("invoices");

// Taux de conversion utilisé pour déduire les sats quand le frontend n'envoie
// que le montant XOF (dashboard marchand). Configurable via XOF_PER_BTC.
const XOF_PER_BTC = Number(process.env.XOF_PER_BTC) || 60000000;

// Libellés opérateur -> nom affiché côté interface (dashboard / checkout).
const PROVIDER_LABELS = { wave: "Wave", orange: "Orange Money", free: "Free Money" };

// Montant XOF -> sats (arrondi, minimum 1 sat).
function xofToSat(xof) {
  return Math.max(1, Math.round((Number(xof) / XOF_PER_BTC) * 1e8));
}

// Normalise une entrée du registre vers la forme attendue par le frontend
// (MerchantDashboard.fromApi + CheckoutPage : id, amount FCFA, bolt11…).
function normalizeInvoice(entry) {
  if (!entry) return null;
  const providerKey = String(entry.provider || "").toLowerCase();
  return {
    id: entry.reference,
    reference: entry.reference,
    merchant: entry.merchant || "Marchand Teranga",
    merchantPhone: entry.merchantPhone || "",
    provider: entry.provider || null,
    liquidation: PROVIDER_LABELS[providerKey] || entry.provider || "Wave",
    amount: entry.amountXOF || null,
    currency: "FCFA",
    amountSat: entry.amountSat || null,
    description: entry.description || "",
    bolt11: entry.bolt11 || null,
    method: "Bitcoin Lightning",
    status: entry.status || "pending",
    payoutStatus: entry.payoutStatus || null,
    paidAt: entry.paidAt || null,
    createdAt: entry.createdAt || null,
    expiresAt: entry.expiresAt || null,
    checkout_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/?pay=${entry.reference}`,
  };
}

// Recherche une facture par reference, id interne, invoiceId Bitnob ou
// payment_hash (le checkout reçoit l'id du lien de paiement).
function findInvoice(idOrRef) {
  const key = String(idOrRef || "").trim();
  if (!key) return null;
  if (invoicesStore.has(key)) return invoicesStore.get(key);
  for (const entry of invoicesStore.values()) {
    if (
      entry.invoiceId === key ||
      entry.reference === key ||
      entry.paymentHash === key
    ) {
      return entry;
    }
  }
  return null;
}

// ==================================================================
// [ÉTAPE 6] — Helpers d'authentification (passwordless)
// ==================================================================

// Extrait le jeton de session (Bearer) d'une requête.
function bearerToken(req) {
  const header = req.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

// Middleware : protège les routes marchand par jeton de session. Attache `req.session`.
function requireMerchant(req, res, next) {
  const session = auth.getSession(bearerToken(req));
  if (!session) {
    return res.status(401).json({
      success: false,
      error: "Authentification requise (jeton de session invalide ou expiré).",
    });
  }
  req.session = session;
  return next();
}

// ==================================================================
// [ÉTAPE 5] — Liquidation Mobile Money après paiement Lightning
// ==================================================================

// Déclenche le payout FCFA vers le numéro du marchand pour la facture
// correspondant à `event.reference` (quote -> initialize -> finalize).
// Idempotent : un événement déjà traité est ignoré (anti double-payout).
async function liquidateMerchantPayout(event) {
  const reference = event.reference || event.invoice_reference || null;
  const entry = reference ? invoicesStore.get(reference) : null;

  if (!entry) {
    console.warn(
      `[teranga-pay] Aucune facture en mémoire pour la référence "${reference}" — liquidation impossible.`
    );
    return;
  }

  if (entry.payoutStatus === "processing" || entry.payoutStatus === "done") {
    console.warn(
      `[teranga-pay] Liquidation déjà traitée pour ${reference} (statut=${entry.payoutStatus}) — doublon ignoré.`
    );
    return;
  }

  if (!entry.merchantPhone || !entry.amountXOF) {
    entry.payoutStatus = "skipped";
    console.warn(
      `[teranga-pay] Facture ${reference} sans numéro marchand ou montant XOF — liquidation ignorée.`
    );
    return;
  }

  entry.payoutStatus = "processing";
  const phone = toInternationalPhone(entry.merchantPhone);

  // Mode démo : on simule le payout sans débiter le wallet Bitnob.
  if (process.env.DEMO_MODE === "true") {
    console.log("=========================================================");
    console.log("[teranga-pay] LIQUIDATION FCFA SIMULÉE (DEMO_MODE=true)");
    console.log(`  facture      : ${reference}`);
    console.log(`  destinataire : ${phone} (${entry.provider || "wave"})`);
    console.log(`  montant      : ${entry.amountXOF} FCFA`);
    console.log("=========================================================");
    entry.payoutStatus = "simulated";
    return;
  }

  try {
    console.log(
      `[teranga-pay] Liquidation ${reference} : ${entry.amountXOF} FCFA -> ${phone} (${entry.provider})…`
    );

    const payout = await bitnob.sendMobileMoneyPayout({
      settlementAmount: entry.amountXOF,
      phone,
      accountName: entry.merchant || "Marchand Teranga",
      provider: entry.provider,
      reference: `payout-${reference}`,
      paymentReason: process.env.PAYOUT_PAYMENT_REASON || "goods_and_services",
      callbackUrl: process.env.PAYOUT_CALLBACK_URL || undefined,
    });

    entry.payoutStatus = "done";
    entry.payout = {
      quoteId: payout.quote?.quote_id || null,
      status: payout.finalized?.status || null,
      settlementAmount: payout.finalized?.settlement_amount || entry.amountXOF,
      fees: payout.finalized?.fees || null,
      exchangeRate: payout.finalized?.exchange_rate || null,
    };

    console.log("=========================================================");
    console.log("[teranga-pay] LIQUIDATION FCFA SOUMISE ✅");
    console.log(`  facture        : ${reference}`);
    console.log(`  destinataire   : ${phone} (${entry.provider})`);
    console.log(`  montant (XOF)  : ${entry.payout.settlementAmount}`);
    console.log(`  quote_id       : ${entry.payout.quoteId}`);
    console.log(`  statut payout  : ${entry.payout.status} (PENDING -> COMPLETED via webhook)`);
    console.log("=========================================================");
  } catch (error) {
    const { status, details } = bitnobError(error);
    entry.payoutStatus = "failed";
    entry.payoutError = { status, details };
    console.error(
      `[teranga-pay] ÉCHEC liquidation ${reference} (${status}) :`,
      JSON.stringify(details)
    );
    console.error(
      `[teranga-pay] La facture reste marquée payée ; relancer la liquidation manuellement si besoin.`
    );
  }
}

// GET /health — sonde de l'état du serveur
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Marque une facture comme payée (idempotent) et déclenche la liquidation.
// Source : webhook Bitnob, polling de statut ou paiement simulé (démo).
function markInvoicePaid(entry, source = "interne") {
  if (!entry) return false;
  if (entry.status === "paid") return false;

  entry.status = "paid";
  entry.paidAt = new Date().toISOString();
  console.log(`[teranga-pay] Facture ${entry.reference} marquée PAYÉE (source=${source}).`);

  liquidateMerchantPayout({ reference: entry.reference }).catch((error) => {
    console.error(
      "[teranga-pay] Liquidation — erreur non gérée :",
      error.message || error
    );
  });
  return true;
}

// GET /api/whoami — valide les identifiants Bitnob (sandbox/prod).
app.get("/api/whoami", async (req, res) => {
  try {
    const data = await bitnob.whoami();
    console.log("[teranga-pay] Bitnob whoami OK :", data);
    res.status(200).json({ success: true, data });
  } catch (error) {
    const { status, details } = bitnobError(error);
    console.error(
      `[teranga-pay] Bitnob whoami ERREUR (${status}) :`,
      JSON.stringify(details)
    );
    res.status(status).json({ success: false, status, error: details });
  }
});

// POST /api/invoices — génère une facture Lightning (recevoir en BTC).
// Body :
//   amount       (sats, requis — montant crypto à recevoir)
//   description  (requis)
//   customer     { email, first_name, last_name, phone_number, country_code,
//                  customer_type }  — crée un client si customer_id absent
//   customer_id  (optionnel — réutilise un client existant)
//   expiry       (optionnel, secondes)
//   reference    (optionnel — clé d'idempotence, générée sinon)
//   [ÉTAPE 5] merchantPhone / provider / amountXOF / merchant
//              — coordonnées de liquidation Mobile Money du marchand
app.post("/api/invoices", async (req, res) => {
  try {
    const {
      amount,
      description,
      customer,
      customer_id,
      expiry,
      reference,
      merchantPhone,
      provider,
      amountXOF,
      merchant,
    } = req.body || {};

    if (!description) {
      return res.status(400).json({
        success: false,
        error: "Le champ 'description' est requis.",
      });
    }

    // Montant : `amount` (sats) directement, sinon déduit du montant XOF
    // envoyé par le dashboard marchand (amountXOF).
    const amountSat = amount ? Number(amount) : amountXOF ? xofToSat(amountXOF) : 0;
    if (!Number.isFinite(amountSat) || amountSat <= 0) {
      return res.status(400).json({
        success: false,
        error: "Fournir 'amount' (sats) ou 'amountXOF' (montant en FCFA).",
      });
    }

    // 1. Créer un client si aucun customer_id n'est fourni.
    let customerId = customer_id || null;
    let customerResponse = null;
    if (!customerId) {
      const customerPayload = {
        email: customer?.email || `client-${Date.now()}@teranga-pay.dev`,
        first_name: customer?.first_name || "Client",
        last_name: customer?.last_name || "Diaspora",
        phone_number: customer?.phone_number || "+221770000000",
        country_code: customer?.country_code || "SEN",
        customer_type: customer?.customer_type || "individual",
      };
      customerResponse = await bitnob.createCustomer(customerPayload);
      customerId = customerResponse?.data?.id || null;
      console.log("[teranga-pay] Client Bitnob créé :", customerId);
    }

    // 2. Générer la facture Lightning (BOLT11).
    const finalReference = reference || `teranga-${crypto.randomUUID()}`;
    const invoicePayload = {
      customer_id: customerId,
      amount: amountSat,
      description,
      reference: finalReference,
    };
    if (expiry) invoicePayload.expiry = Number(expiry);

    const invoiceResponse = await bitnob.createLightningInvoice(invoicePayload);
    const invoice = invoiceResponse?.data || invoiceResponse;
    const paymentRequest = invoice?.request || invoice?.payment_request;

    // 3. Générer le QR code associé (BOLT11 en majuscules pour le QR).
    const qrCode = paymentRequest
      ? await QRCode.toDataURL(paymentRequest.toUpperCase(), {
          margin: 1,
          width: 320,
        })
      : null;

    // 4. [ÉTAPE 5] Enregistrer la facture pour la liquidation au webhook.
    const entry = {
      invoiceId: invoice?.id || null,
      reference: finalReference,
      description,
      amountSat,
      amountXOF: amountXOF ? Number(amountXOF) : null,
      merchant: merchant || null,
      merchantPhone: merchantPhone || null,
      provider: provider || null,
      customerId,
      bolt11: paymentRequest || null,
      paymentHash: invoice?.payment_hash || null,
      expiresAt: invoice?.expires_at || null,
      status: "pending",
      payoutStatus: null,
      paidAt: null,
      createdAt: new Date().toISOString(),
    };
    invoicesStore.set(finalReference, entry);

    console.log("[teranga-pay] Facture Lightning créée :", invoice?.id);

    res.status(201).json({
      success: true,
      invoice,
      paymentRequest,
      qrCode,
      customer: customerResponse?.data || null,
      // Champs plats attendus par MerchantDashboard.fromApi / CheckoutPage.
      ...normalizeInvoice(entry),
    });
  } catch (error) {
    const { status, details } = bitnobError(error);
    console.error(
      `[teranga-pay] Création facture ERREUR (${status}) :`,
      JSON.stringify(details)
    );
    res.status(status).json({ success: false, status, error: details });
  }
});

// GET /api/invoices — liste des factures du registre (plus récentes en premier).
//   Query optionnels : merchantPhone | phone (filtre numéro marchand),
//                      merchant (nom), status (pending | paid).
app.get("/api/invoices", (req, res) => {
  const phone = String(req.query.merchantPhone || req.query.phone || "").replace(/\D/g, "");
  const merchant = String(req.query.merchant || "").trim().toLowerCase();
  const status = String(req.query.status || "").trim().toLowerCase();

  let list = [...invoicesStore.values()];

  if (phone) {
    const target = phone.length > 9 ? phone.slice(-9) : phone;
    list = list.filter((e) => {
      const digits = String(e.merchantPhone || "").replace(/\D/g, "");
      return digits.endsWith(target);
    });
  }
  if (merchant) {
    list = list.filter((e) => String(e.merchant || "").toLowerCase().includes(merchant));
  }
  if (status === "paid" || status === "pending") {
    list = list.filter((e) => (e.status || "pending") === status);
  }

  list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  res.json({
    success: true,
    count: list.length,
    invoices: list.map(normalizeInvoice),
  });
});

// GET /api/invoices/:id — détail d'un lien de paiement (guichet checkout).
//   `id` accepté : reference, id interne, invoiceId Bitnob ou payment_hash.
app.get("/api/invoices/:id", (req, res) => {
  const entry = findInvoice(req.params.id);
  if (!entry) {
    return res
      .status(404)
      .json({ success: false, error: `Facture "${req.params.id}" introuvable.` });
  }
  res.json(normalizeInvoice(entry));
});

// GET /api/invoices/:id/status — polling du statut (checkout client).
//   Si la facture n'est pas encore payée, on interroge Bitnob (au plus 1 appel
//   toutes les 5 s par facture) : permet de confirmer un paiement même sans
//   webhook public (ngrok). Un paiement confirmé déclenche la liquidation.
app.get("/api/invoices/:id/status", async (req, res) => {
  const entry = findInvoice(req.params.id);
  if (!entry) {
    return res
      .status(404)
      .json({ success: false, error: `Facture "${req.params.id}" introuvable.` });
  }

  if (entry.status !== "paid" && entry.invoiceId) {
    const now = Date.now();
    if (now - (entry.lastCheckedAt || 0) >= 5000) {
      entry.lastCheckedAt = now;
      try {
        const response = await bitnob.getLightningInvoice(entry.invoiceId);
        const remote = response?.data || response;
        const remoteStatus = String(remote?.status || "").toLowerCase();
        if (["paid", "complete", "completed", "confirmed", "settled"].includes(remoteStatus)) {
          markInvoicePaid(entry, "polling-bitnob");
        }
      } catch (error) {
        console.warn(
          `[teranga-pay] Polling statut ${entry.reference} impossible :`,
          error.response?.status || error.message
        );
      }
    }
  }

  res.json({ success: true, ...normalizeInvoice(entry) });
});

// POST /api/invoices/:id/simulate-card — (démo) encaissement sans paiement réel.
//   Réservé à DEMO_MODE=true : marque la facture payée et lance la liquidation
//   simulée, comme le ferait le webhook Bitnob.
app.post("/api/invoices/:id/simulate-card", (req, res) => {
  if (process.env.DEMO_MODE !== "true") {
    return res.status(403).json({
      success: false,
      error: "Simulation réservée au mode démo (DEMO_MODE=true).",
    });
  }

  const entry = findInvoice(req.params.id);
  if (!entry) {
    return res
      .status(404)
      .json({ success: false, error: `Facture "${req.params.id}" introuvable.` });
  }

  markInvoicePaid(entry, "simulate-card");
  res.json({ success: true, ...normalizeInvoice(entry) });
});

// POST /api/webhooks/bitnob — réception des notifications Bitnob.
//   Sécurité : en-tête x-bitnob-signature (HMAC-SHA512 du body brut, secret webhook).
//   Événement de paiement Lightning reçu : "btc.lightning.received.success".
//   [ÉTAPE 5] : à la confirmation du paiement, déclenche automatiquement la
//   liquidation FCFA vers le Mobile Money du marchand (payouts Bitnob).
//   On répond 200 AVANT le payout pour éviter tout renvoi de Bitnob pendant
//   les appels API du payout (3 requêtes) ; la liquidation tourne en tâche
//   de fond, protégée contre les doublons par le statut du registre.
app.post("/api/webhooks/bitnob", (req, res) => {
  const signature = req.get("x-bitnob-signature");
  const rawBody = req.rawBody ? req.rawBody.toString("utf8") : "";

  const verified = bitnob.verifyWebhookSignature(rawBody, signature);
  if (verified === null) {
    // Pas de secret configuré : on accepte en dev mais on prévient clairement.
    console.warn(
      "[teranga-pay] BITNOB_WEBHOOK_SECRET absent — signature NON vérifiée (mode dev)."
    );
  } else if (verified === false) {
    console.warn("[teranga-pay] Webhook Bitnob REJETÉ : signature invalide.");
    return res.status(401).json({ success: false, error: "Invalid signature" });
  }

  const event = req.body || {};
  const eventType = event.event || event.type || "unknown";

  // Toujours répondre 200 OK pour éviter les renvois de Bitnob.
  res.status(200).json({ success: true, received: true });

  if (eventType === "btc.lightning.received.success") {
    console.log("======================================================");
    console.log("[teranga-pay] PAIEMENT LIGHTNING CONFIRMÉ ✅");
    console.log(`  event        : ${eventType}`);
    console.log(`  reference    : ${event.reference}`);
    console.log(`  amount (sat) : ${event.amount ?? event.amount_sat}`);
    console.log(`  payment_hash : ${event.payment_hash}`);
    console.log(`  transaction  : ${event.transaction_id}`);
    console.log(`  timestamp    : ${event.timestamp}`);
    console.log("======================================================");

    // [ÉTAPE 5] Liquidation FCFA en tâche de fond (le 200 est déjà parti).
    // markInvoicePaid est idempotent : webhook + polling ne liquident qu'une fois.
    const entry = findInvoice(event.reference || event.payment_hash);
    markInvoicePaid(entry, "webhook-bitnob");
  } else {
    console.log(`[teranga-pay] Webhook Bitnob reçu (event="${eventType}")`);
  }
});

// GET /api/webhooks/bitnob — simple sonde pour valider le tunnel ngrok.
app.get("/api/webhooks/bitnob", (req, res) => {
  res.json({
    status: "ok",
    message: "Webhook Bitnob prêt. Envoyez un POST signé ici.",
  });
});

// ==================================================================
// [ÉTAPE 6] — Auth passwordless (OTP par numéro Mobile Money)
// ==================================================================

// POST /api/auth/otp — demande un code de vérification pour un numéro.
// Body : { phone, shop? }
app.post("/api/auth/otp", (req, res) => {
  const { phone, shop } = req.body || {};
  const result = auth.requestOtp(phone, shop);
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });
  res.status(200).json({ success: true, ...result });
});

// POST /api/auth/otp/verify — vérifie le code et ouvre une session (renvoie un jeton).
// Body : { phone, code, shop? }
app.post("/api/auth/otp/verify", (req, res) => {
  const { phone, code, shop } = req.body || {};
  const result = auth.verifyOtp(phone, code, shop);
  if (!result.ok) {
    const status = result.error && result.error.includes("Trop de tentatives") ? 429 : 401;
    return res.status(status).json({ success: false, error: result.error, attemptsLeft: result.attemptsLeft });
  }
  res.status(200).json({ success: true, phone: result.phone, session: result.session });
});

// ==================================================================
// [ÉTAPE 6] — Profil marchand (protégé par jeton de session)
// ==================================================================

// GET /api/merchants/me — profil + session courante.
app.get("/api/merchants/me", requireMerchant, (req, res) => {
  res.json({
    success: true,
    session: { phone: req.session.phone, shop: req.session.shop, since: req.session.since },
    merchant: auth.getMerchant(req.session.phone),
  });
});

// PUT /api/merchants/me — met à jour le profil (ex. { shop: "Ma Boutique" }).
app.put("/api/merchants/me", requireMerchant, (req, res) => {
  const { shop } = req.body || {};
  const updated = auth.updateMerchant(req.session.phone, shop ? { shop } : {});
  if (shop) req.session.shop = shop;
  res.json({ success: true, merchant: updated });
});

// ==================================================================
// [ÉTAPE 6] — Paiement par carte (Stripe Checkout) en alternative au Lightning
// ==================================================================

// POST /api/invoices/:id/card — crée une session Stripe Checkout pour cette facture.
// Body optionnel : { returnUrl } (sinon PUBLIC_URL / ?pay=<ref>).
app.post("/api/invoices/:id/card", async (req, res) => {
  if (!stripe.isConfigured()) {
    return res.status(503).json({
      success: false,
      error: "Paiement carte indisponible : Stripe non configuré (STRIPE_SECRET_KEY manquant).",
    });
  }

  const entry = findInvoice(req.params.id);
  if (!entry) {
    return res.status(404).json({ success: false, error: `Facture "${req.params.id}" introuvable.` });
  }
  if (entry.status === "paid") {
    return res.status(409).json({ success: false, error: "Cette facture est déjà payée." });
  }

  const base = req.body?.returnUrl || process.env.PUBLIC_URL || "";
  const successUrl = `${base}/?pay=${entry.reference}&paid=1`;
  const cancelUrl = `${base}/?pay=${entry.reference}`;

  try {
    const session = await stripe.createCheckoutSession({
      amount: entry.amountXOF,
      description: entry.description,
      reference: entry.reference,
      successUrl,
      cancelUrl,
      metadata: { reference: entry.reference, invoiceId: String(entry.invoiceId || entry.reference) },
    });
    res.status(201).json({
      success: true,
      provider: "stripe",
      sessionId: session.id,
      checkoutUrl: session.url,
      amountTotal: session.amountTotal,
      currency: session.currency,
    });
  } catch (error) {
    const status = error.response?.status || 500;
    const details = error.response?.data || { message: error.message };
    console.error(`[teranga-pay] Stripe checkout ERREUR (${status}) :`, JSON.stringify(details));
    res.status(status).json({ success: false, status, error: details });
  }
});

// POST /api/webhooks/stripe — reçoit checkout.session.completed et marque la facture payée.
// Sécurité : signature `t=...,v1=...` vérifiée avec STRIPE_WEBHOOK_SECRET.
// (Le corps brut est conservé via express.json({ verify }) pour la vérification.)
app.post("/api/webhooks/stripe", (req, res) => {
  const signature = req.get("stripe-signature");
  const rawBody = req.rawBody ? req.rawBody.toString("utf8") : "";

  const verified = stripe.verifyWebhookSignature(rawBody, signature);
  if (verified === null) {
    console.warn("[teranga-pay] STRIPE_WEBHOOK_SECRET absent — signature NON vérifiée (mode dev).");
  } else if (verified === false) {
    console.warn("[teranga-pay] Webhook Stripe REJETÉ : signature invalide.");
    return res.status(401).json({ success: false, error: "Invalid signature" });
  }

  const event = req.body || {};
  const type = event.type || "unknown";
  const obj = event.data?.object || {};
  const reference = obj.client_reference_id || obj.metadata?.reference || null;

  // Toujours répondre 200 pour éviter les renvois Stripe.
  res.status(200).json({ success: true, received: true });

  if (type === "checkout.session.completed") {
    console.log("======================================================");
    console.log("[teranga-pay] PAIEMENT CARTE CONFIRMÉ (Stripe) ✅");
    console.log(`  type        : ${type}`);
    console.log(`  reference   : ${reference}`);
    console.log(`  montant     : ${obj.amount_total} ${obj.currency}`);
    console.log("======================================================");
    const entry = reference ? findInvoice(reference) : null;
    markInvoicePaid(entry, "stripe-card");
  } else {
    console.log(`[teranga-pay] Webhook Stripe reçu (type="${type}")`);
  }
});

const PORT = process.env.PORT || 5000;

// [ÉTAPE 6] Exécution directe => on écoute. Import (tests) => on exporte l'app sans écouter.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[teranga-pay] Serveur backend démarré sur http://localhost:${PORT}`);
    console.log(`[teranga-pay] Mode : DEMO_MODE=${process.env.DEMO_MODE} · Stripe=${stripe.isConfigured() ? "configuré" : "non configuré"}`);
    // Nettoyage périodique des OTP / sessions expirés (toutes les 5 min).
    setInterval(() => {
      try {
        auth.pruneExpired();
      } catch {
        /* best effort */
      }
    }, 5 * 60 * 1000).unref?.();
  });
}

module.exports = app;
