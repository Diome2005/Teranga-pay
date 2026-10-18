// [FICHIER] : backend/server.js
// [RÔLE] : point d'entrée Express du backend Teranga Pay.
// [ÉTAPE 1] : serveur minimal — GET /health.
// [ÉTAPE 2] : GET /api/whoami — test d'authentification Bitnob.
// [ÉTAPE 3] : POST /api/invoices — crée un client (si besoin) + facture Lightning.
// [ÉTAPE 4] : POST /api/webhooks/bitnob — réception des notifications de paiement.
// [ÉTAPE 5] : liquidation Mobile Money — à la réception du webhook de paiement
//   Lightning (deposit.success — alias historique btc.lightning.received.success),
//   payout FCFA automatique vers le numéro du marchand (Wave / Orange Money /
//   Free Money) via le flux payouts Bitnob.
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

// Registre des webhooks Bitnob déjà traités (dédup sur event_id).
// Bitnob peut réémettre le même événement (retry réseau, ou plusieurs webhooks
// configurés dans le dashboard) : sans ce registre, un second webhook de paiement
// déclencherait une seconde liquidation FCFA pour la même facture. TTL 7 jours.
const webhookEventsStore = store.collection("webhook_events");
const WEBHOOK_EVENT_TTL_MS = 7 * 24 * 3600 * 1000;

// Clé de dédup d'un webhook : en-tête x-bitnob-event-id, sinon event_id présent
// dans le corps (sandbox : { event_id: "…" }), sinon empreinte SHA-256 du brut.
function webhookEventKey(req) {
  const header = req.get("x-bitnob-event-id");
  if (header && String(header).trim()) return String(header).trim();
  const payloadId = req.body?.event_id || req.body?.data?.event_id;
  if (payloadId && String(payloadId).trim()) return String(payloadId).trim();
  const raw = req.rawBody || Buffer.from("");
  return `sha256:${crypto.createHash("sha256").update(raw).digest("hex")}`;
}

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
//   `publicView: true` (routes publiques checkout) : masque les données
//   personnelles du marchand (numéro Mobile Money) — seuls le nom de boutique
//   et les champs nécessaires au paiement sont exposés.
function normalizeInvoice(entry, { publicView = false } = {}) {
  if (!entry) return null;
  const providerKey = String(entry.provider || "").toLowerCase();
  return {
    id: entry.reference,
    reference: entry.reference,
    merchant: entry.merchant || "Marchand Teranga",
    merchantPhone: publicView ? "" : entry.merchantPhone || "",
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

// Libellé français du type de transaction Bitnob (page « Activité récente BTC »).
const TX_TYPE_LABELS = {
  DEPOSIT_CONFIRMED: "Dépôt",
  DEPOSIT_DETECTED: "Dépôt",
  DEPOSIT_PENDING: "Dépôt",
  WITHDRAWAL_INITIATED: "Paiement",
  WITHDRAWAL_FAILED: "Paiement",
  WITHDRAWAL_SUCCESS: "Paiement",
  P2P_TRANSFER: "Transfert",
  SWAP_INTERNAL: "Échange",
  FX_REBALANCING: "Conversion",
  FEE_ONLY: "Frais",
  REVERSAL: "Annulation",
};

// Normalise une transaction Bitnob (GET /api/transactions) vers la forme
// attendue par le volet « Activité récente BTC » du dashboard.
//   `amount` Bitnob est en plus petite unité (satoshi pour BTC) ; négatif = débit.
function normalizeTransaction(tx) {
  if (!tx) return null;
  const type = String(tx.type || "").toUpperCase();
  const side = String(tx.side || "").toLowerCase();
  const credit = side === "credit" || type.startsWith("DEPOSIT");
  const sats = Math.abs(Number(tx.amount || 0));
  const metadata = tx.metadata || {};
  return {
    id: tx.transaction_id || tx.reference || "",
    date: tx.created_at || tx.value_date || null,
    description: metadata.description || tx.description || tx.reference || "",
    typeLabel: TX_TYPE_LABELS[type] || (credit ? "Dépôt" : "Paiement"),
    direction: credit ? "credit" : "debit",
    amountSat: sats,
    amountBtc: sats / 1e8,
    state: String(tx.state || "").toUpperCase(),
    currency: tx.currency || "BTC",
    reference: tx.reference || "",
    txHash: metadata.tx_hash || metadata.transaction_hash || tx.tx_hash || tx.reference || "",
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

// Vérifie qu'une facture appartient bien au numéro de la session (comparaison
// sur les 9 derniers chiffres — formats +221…/0…/avec espaces). Toute route
// marchand agissant sur une facture existante DOIT passer par ce test :
// l'identité vient toujours de la session, jamais de l'URL ou du body.
function invoiceBelongsToSession(entry, sessionPhone) {
  const target = String(sessionPhone || "").replace(/\D/g, "");
  if (!target || !entry) return false;
  const normalized = target.length > 9 ? target.slice(-9) : target;
  return String(entry.merchantPhone || "")
    .replace(/\D/g, "")
    .endsWith(normalized);
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
  invoicesStore.set(entry.reference, entry); // persisté AVANT l'appel API (anti-double-payout après redémarrage)
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
// [SÉCURITÉ] : route de diagnostic réservée aux marchands connectés — elle
// expose les infos du compte Bitnob et ne doit pas être publique en production.
app.get("/api/whoami", requireMerchant, async (req, res) => {
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

// GET /api/wallet/transactions — activité récente du portefeuille BTC du marchand.
// Proxy signé vers GET /api/transactions de Bitnob (currency=BTC), normalisé pour
// le volet « Activité récente BTC ». Requiert Authorization: Bearer <token>.
//   Query optionnel : limit (défaut 25, max 100).
// Toujours les vraies APIs : aucune donnée simulée (pas de mode démo).
app.get("/api/wallet/transactions", requireMerchant, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 25, 100);

  try {
    const data = await bitnob.listTransactions({ limit, currency: "BTC" });
    const raw = data?.data?.transactions || [];
    res.json({
      success: true,
      nextCursor: data?.data?.next_cursor || "",
      transactions: raw.map(normalizeTransaction).filter(Boolean),
    });
  } catch (error) {
    const { status, details } = bitnobError(error);
    console.error(`[teranga-pay] Bitnob transactions ERREUR (${status}) :`, JSON.stringify(details));
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
  const merchant = String(req.query.merchant || "").trim().toLowerCase();
  const status = String(req.query.status || "").trim().toLowerCase();

  // [SÉCURITÉ] : un marchand ne voit que ses propres factures. Le filtre est
  // dérivé de la session (jamais du body/query) pour empêcher l'usurpation.
  let list = [...invoicesStore.values()].filter((e) =>
    invoiceBelongsToSession(e, req.session.phone)
  );

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
//   Route publique (le client diaspora n'a pas de compte) : le numéro Mobile
//   Money du marchand est masqué (publicView).
app.get("/api/invoices/:id", (req, res) => {
  const entry = findInvoice(req.params.id);
  if (!entry) {
    return res
      .status(404)
      .json({ success: false, error: `Facture "${req.params.id}" introuvable.` });
  }
  res.json(normalizeInvoice(entry, { publicView: true }));
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

  res.json({ success: true, ...normalizeInvoice(entry, { publicView: true }) });
});

// POST /api/invoices/:id/simulate-card — encaissement simulé (sans carte réelle).
//   Appelle l'endpoint sandbox Bitnob POST /api/lightning/invoices/:id/simulate-payment,
//   qui déclenche un vrai webhook deposit.success -> liquidation FCFA réelle.
//   [SÉCURITÉ] : réservé au marchand propriétaire de la facture (Bearer) — sans
//   quoi n'importe qui pourrait déclencher des paiements simulés et des payouts.
app.post("/api/invoices/:id/simulate-card", requireMerchant, async (req, res) => {
  const entry = findInvoice(req.params.id);
  if (!entry) {
    return res
      .status(404)
      .json({ success: false, error: `Facture "${req.params.id}" introuvable.` });
  }
  if (!invoiceBelongsToSession(entry, req.session.phone)) {
    return res.status(403).json({
      success: false,
      error: "Cette facture n'appartient pas au compte connecté.",
    });
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
      message: "Paiement simulé côté Bitnob — webhook deposit.success en attente.",
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
//   Événement de paiement Lightning (sandbox actuel) : "deposit.success" — le
//   détail est imbriqué sous `data` (chain="lightning", reference, amount…).
//   Alias historique (doc) : "btc.lightning.received.success" — champs à la racine.
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
      require("./services/webhookDebug").report(rawBody, signature, req.headers);
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
  // Le sandbox Bitnob imbrique le détail sous `data` ; l'alias historique
  // envoyait les champs à la racine du JSON. On lit toujours `payload`.
  const payload = event.data && typeof event.data === "object" ? event.data : event;

  // [DÉDUP] : un même événement ne doit jamais être traité deux fois (Bitnob
  // peut réémettre le même webhook — retry réseau, double livraison). Clé :
  // en-tête x-bitnob-event-id, event_id du corps, sinon SHA-256 du corps brut.
  const eventKey = webhookEventKey(req);
  const isDuplicate = webhookEventsStore.has(eventKey);
  if (isDuplicate) {
    console.log(
      `[teranga-pay] Webhook "${eventType}" déjà traité (event_id=${eventKey}) — doublon ignoré.`
    );
  } else {
    webhookEventsStore.set(eventKey, {
      eventId: eventKey,
      event: eventType,
      receivedAt: new Date().toISOString(),
      expiresAt: Date.now() + WEBHOOK_EVENT_TTL_MS,
    });
  }

  // Toujours répondre 200 OK pour éviter les renvois de Bitnob.
  res.status(200).json({ success: true, received: true, duplicate: isDuplicate });
  if (isDuplicate) return;

  // Paiement Lightning : format sandbox imbriqué (deposit.success, chain=lightning)
  // ou alias historique à plat. Un dépôt on-chain (chain="bitcoin") est ignoré.
  const isLightningDeposit =
    eventType === "btc.lightning.received.success" ||
    (eventType === "deposit.success" && (!payload.chain || payload.chain === "lightning"));

  if (isLightningDeposit) {
    console.log("======================================================");
    console.log("[teranga-pay] PAIEMENT LIGHTNING CONFIRMÉ ✅");
    console.log(`  event        : ${eventType}`);
    console.log(`  reference    : ${payload.reference}`);
    console.log(`  amount (sat) : ${payload.amount ?? payload.amount_sat}`);
    console.log(`  payment_hash : ${payload.payment_hash}`);
    console.log(`  transaction  : ${payload.transaction_id}`);
    console.log(`  timestamp    : ${payload.timestamp}`);
    console.log("======================================================");

    // [ÉTAPE 5] Liquidation FCFA en tâche de fond (le 200 est déjà parti).
    // markInvoicePaid est idempotent : webhook + polling ne liquident qu'une fois.
    const entry = findInvoice(payload.reference || payload.payment_hash);
    markInvoicePaid(entry, "webhook-bitnob");
  } else if (eventType === "deposit.success") {
    // Dépôt on-chain : aucune facture Lightning associée — rien à liquider.
    console.log(
      `[teranga-pay] Webhook deposit.success hors Lightning (chain="${payload.chain}") — ignoré.`
    );
  } else if (eventType.startsWith("payouts.")) {
    // [ÉTAPE 5] Cycle de vie du payout (initialized / processing / success / failed).
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

// Route inconnue -> 404 JSON (le frontend interprète toujours du JSON).
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route introuvable : ${req.method} ${req.path}`,
  });
});

const PORT = process.env.PORT || 5000;

// [ÉTAPE 6] Exécution directe => on écoute. Import (tests) => on exporte l'app sans écouter.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[teranga-pay] Serveur backend démarré sur http://localhost:${PORT}`);
    // Nettoyage périodique des OTP / sessions / événements webhook expirés (5 min).
    setInterval(() => {
      try {
        auth.pruneExpired();
        webhookEventsStore.pruneExpired();
      } catch {
        /* best effort */
      }
    }, 5 * 60 * 1000).unref?.();
  });
}

module.exports = app;
