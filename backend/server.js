// [FICHIER] : backend/server.js
// [RÔLE] : point d'entrée Express du backend Teranga Pay.
// [ÉTAPE 1] : serveur minimal — GET /health.
// [ÉTAPE 2] : GET /api/whoami — test d'authentification Bitnob.
// [ÉTAPE 3] : POST /api/invoices — crée un client (si besoin) + facture Lightning.
// [ÉTAPE 4] : POST /api/webhooks/bitnob — réception des notifications de paiement.
// [ÉTAPE 5] : liquidation Mobile Money — à la réception de
//   btc.lightning.received.success, payout FCFA automatique vers le numéro
//   du marchand (Wave / Orange Money / Free Money) via le flux payouts Bitnob.
// [ÉTAPE 6] : persistance (store JSON) et auth passwordless (OTP).

require("dotenv").config();
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const bitnob = require("./services/bitnobService");
const auth = require("./services/auth");
const store = require("./services/store");

const app = express();

// [SÉCURITÉ] : autoriser uniquement l'origine du frontend (CORS restreint).
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
app.use(cors({ origin: FRONTEND_URL }));
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
    invoicesStore.set(entry.reference, entry);
    console.warn(
      `[teranga-pay] Facture ${reference} sans numéro marchand ou montant XOF — liquidation ignorée.`
    );
    return;
  }

  entry.payoutStatus = "processing";
  const phone = toInternationalPhone(entry.merchantPhone);

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
    invoicesStore.set(entry.reference, entry);

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
    invoicesStore.set(entry.reference, entry);
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
// Source : webhook Bitnob, polling de statut ou encaissement sandbox /simulate-card.
function markInvoicePaid(entry, source = "interne") {
  if (!entry) return false;
  if (entry.status === "paid") return false;

  entry.status = "paid";
  entry.paidAt = new Date().toISOString();
  invoicesStore.set(entry.reference, entry); // persistance du statut sur disque
  console.log(`[teranga-pay] Facture ${entry.reference} marquée PAYÉE (source=${source}).`);

  liquidateMerchantPayout({ reference: entry.reference }).catch((error) => {
    console.error(
      "[teranga-pay] Liquidation — erreur non gérée :",
      error.message || error
    );
  });
  return true;
}

// [ÉTAPE 5] — Dénouement d'un payout (webhook payouts.withdrawal.success / .expired).
//   Le payout est lancé avec la référence `payout-<reference>` ; on retire ce préfixe
//   pour retrouver la facture. Met à jour payoutStatus : "completed" (reçu) ou "failed".
function handlePayoutEvent(event) {
  const rawRef =
    event.reference ||
    event.invoice_reference ||
    event.data?.reference ||
    event.data?.payout?.reference ||
    event.data?.transaction?.reference ||
    null;
  const reference = rawRef ? String(rawRef).replace(/^payout-/, "") : null;
  const type = String(event.event || event.type || "").toLowerCase();
  const remoteStatus = String(
    event.data?.payout?.status || event.data?.status || event.status || ""
  ).toUpperCase();

  const entry = reference ? findInvoice(reference) : null;
  if (!entry) {
    console.warn(
      `[teranga-pay] Payout webhook sans facture correspondante (ref="${rawRef}", type="${type}").`
    );
    return;
  }

  const succeeded = type.includes("success") || remoteStatus === "SUCCESS" || remoteStatus === "COMPLETED";
  const failed = type.includes("expired") || type.includes("failed") || remoteStatus === "EXPIRED" || remoteStatus === "FAILED";

  if (succeeded) {
    entry.payoutStatus = "completed";
    entry.payout = {
      ...(entry.payout || {}),
      status: remoteStatus || "SUCCESS",
      completedAt: new Date().toISOString(),
    };
    console.log("======================================================");
    console.log("[teranga-pay] PAYOUT MOBILE MONEY CONFIRMÉ ✅");
    console.log(`  facture    : ${reference}`);
    console.log(`  montant    : ${entry.amountXOF} FCFA -> ${entry.merchantPhone} (${entry.provider})`);
    console.log(`  statut     : ${entry.payout.status}`);
    console.log("======================================================");
  } else if (failed) {
    entry.payoutStatus = "failed";
    entry.payoutError = { reason: type || remoteStatus, details: event.data || null };
    console.warn(
      `[teranga-pay] PAYOUT MOBILE MONEY ÉCHOUÉ ✗ ${reference} (type="${type}") — à relancer manuellement.`
    );
  } else {
    console.log(`[teranga-pay] Payout webhook reçu pour ${reference} (type="${type}").`);
  }

  invoicesStore.set(entry.reference, entry);
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
app.post("/api/invoices", requireMerchant, async (req, res) => {
  try {
    const {
      amount,
      description,
      customer,
      customer_id,
      expiry,
      reference,
      provider,
      amountXOF,
    } = req.body || {};

    // Le marchand est identifié par la session (compte email/mot de passe ou OTP) —
    // on ignore tout merchantPhone/merchant du body pour éviter l'usurpation.
    const merchantPhone = req.session.phone;
    const merchant = req.session.shop || "Marchand Teranga";

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
      merchant,
      merchantPhone,
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

// GET /api/invoices — liste des factures DU MARCHAND CONNECTÉ
// (plus récentes en premier). Requiert le header Authorization: Bearer <token>.
//   Query optionnels : merchant (nom), status (pending | paid).
app.get("/api/invoices", requireMerchant, (req, res) => {
  const sessionPhone = String(req.session.phone || "").replace(/\D/g, "");
  const merchant = String(req.query.merchant || "").trim().toLowerCase();
  const status = String(req.query.status || "").trim().toLowerCase();

  let list = [...invoicesStore.values()];

  // [SÉCURITÉ] : un marchand ne voit que ses propres factures. Le filtre est
  // dérivé de la session (jamais du body/query) pour empêcher l'usurpation.
  if (sessionPhone) {
    const target = sessionPhone.length > 9 ? sessionPhone.slice(-9) : sessionPhone;
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

// POST /api/invoices/:id/simulate-card — encaissement simulé (sans carte réelle).
//   Appelle l'endpoint sandbox Bitnob POST /api/lightning/invoices/:id/simulate-payment,
//   qui déclenche un vrai webhook btc.lightning.received.success -> liquidation FCFA réelle.
app.post("/api/invoices/:id/simulate-card", async (req, res) => {
  const entry = findInvoice(req.params.id);
  if (!entry) {
    return res
      .status(404)
      .json({ success: false, error: `Facture "${req.params.id}" introuvable.` });
  }
  if (entry.status === "paid") {
    return res.status(409).json({ success: false, error: "Cette facture est déjà payée." });
  }

  if (!entry.invoiceId) {
    return res.status(400).json({
      success: false,
      error: "Facture sans invoiceId Bitnob — simulation réelle impossible.",
    });
  }

  try {
    const result = await bitnob.simulateLightningPayment(entry.invoiceId);
    return res.json({
      success: true,
      simulated: true,
      message: "Paiement simulé côté Bitnob — webhook btc.lightning.received.success en attente.",
      invoiceId: entry.invoiceId,
      ...(result?.data || {}),
    });
  } catch (error) {
    const { status, details } = bitnobError(error);
    console.error(
      `[teranga-pay] Simulation Bitnob ERREUR (${status}) :`,
      JSON.stringify(details)
    );
    return res.status(status).json({ success: false, status, error: details });
  }
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

  // [DEBUG] WEBHOOK_DEBUG=true : journalise quel secret × algorithme matche la signature reçue.
  if (process.env.WEBHOOK_DEBUG === "true") {
    try {
      require("./services/webhookDebug").report(rawBody, signature);
    } catch {
      /* best effort */
    }
  }

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
  } else if (eventType.startsWith("payouts.")) {
    // [ÉTAPE 5] Cycle de vie du payout (withdrawal.success / withdrawal.expired).
    handlePayoutEvent(event);
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
// [ÉTAPE 6] — Auth marchand : email + mot de passe (compte) et OTP passwordless
// ==================================================================

// POST /api/auth/register — création d'un compte marchand (email + mot de passe).
// Body : { email, password, phone, shop? }
app.post("/api/auth/register", async (req, res) => {
  const { email, password, phone, shop } = req.body || {};
  try {
    const result = await auth.register({ email, password, phone, shop });
    if (!result.ok) return res.status(400).json({ success: false, error: result.error });
    res.status(201).json({
      success: true,
      email: result.email,
      phone: result.phone,
      session: result.session,
    });
  } catch (error) {
    console.error("[teranga-pay] register erreur :", error.message || error);
    res.status(500).json({ success: false, error: "Impossible de créer le compte." });
  }
});

// POST /api/auth/login — connexion par email + mot de passe.
// Body : { email, password }
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  try {
    const result = auth.login({ email, password });
    if (!result.ok) return res.status(401).json({ success: false, error: result.error });
    res.status(200).json({
      success: true,
      email: result.email,
      phone: result.phone,
      session: result.session,
    });
  } catch (error) {
    console.error("[teranga-pay] login erreur :", error.message || error);
    res.status(500).json({ success: false, error: "Impossible de se connecter." });
  }
});

// POST /api/auth/otp — demande un code de vérification pour un numéro.
// Body : { phone, shop? }
app.post("/api/auth/otp", async (req, res) => {
  const { phone, shop } = req.body || {};
  try {
    const result = await auth.requestOtp(phone, shop);
    if (!result.ok) return res.status(400).json({ success: false, error: result.error });
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("[teranga-pay] OTP erreur :", error.message || error);
    res.status(500).json({ success: false, error: "Impossible de demander un code." });
  }
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

const PORT = process.env.PORT || 5000;

// [ÉTAPE 6] Exécution directe => on écoute. Import (tests) => on exporte l'app sans écouter.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[teranga-pay] Serveur backend démarré sur http://localhost:${PORT}`);
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
