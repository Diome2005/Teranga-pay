// [FICHIER] : backend/services/bitnobService.js
// [RÔLE] : couche d'accès à l'API Bitnob (base URL + signature HMAC-SHA256).
// [AUTH] : chaque requête est signée avec CLIENT_SECRET.
//   Chaîne signée : CLIENT_ID:TIMESTAMP:NONCE:PAYLOAD
//   PAYLOAD = body JSON brut exact (chaîne vide s'il n'y a pas de body).
//   En-têtes : X-Auth-Client, X-Auth-Timestamp, X-Auth-Nonce, X-Auth-Signature.
// [ÉTAPE 2] : whoami.
// [ÉTAPE 3] : createCustomer, createLightningInvoice.
// [ÉTAPE 5] : payouts Mobile Money — createPayoutQuote, initializePayout,
//   finalizePayout, sendMobileMoneyPayout (orchestration quote → initialize → finalize).

const crypto = require("crypto");
const axios = require("axios");

const DEFAULT_BITNOB_BASE_URL = "https://api.bitnob.com";
const CLIENT_ID = process.env.BITNOB_CLIENT_ID;
const CLIENT_SECRET = process.env.BITNOB_CLIENT_SECRET;

// Lue à chaque requête (et non au chargement du module) pour permettre aux tests
// d'injecter un stub HTTP local via BITNOB_BASE_URL sans redémarrer le process.
function baseUrl() {
  return process.env.BITNOB_BASE_URL || DEFAULT_BITNOB_BASE_URL;
}

// Génère un nonce cryptographique de 16 octets (hex) — unicité par requête.
function generateNonce() {
  return crypto.randomBytes(16).toString("hex");
}

// Construit la signature HMAC-SHA256 hex pour une requête Bitnob.
function buildSignature({ timestamp, nonce, payload }) {
  const stringToSign = `${CLIENT_ID}:${timestamp}:${nonce}:${payload}`;
  return crypto
    .createHmac("sha256", CLIENT_SECRET)
    .update(stringToSign, "utf8")
    .digest("hex");
}

// En-têtes à partir d'un payload déjà sérialisé (chaîne).
function authHeadersForPayload(payload) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();
  return {
    "Content-Type": "application/json",
    "X-Auth-Client": CLIENT_ID,
    "X-Auth-Timestamp": timestamp,
    "X-Auth-Nonce": nonce,
    "X-Auth-Signature": buildSignature({ timestamp, nonce, payload }),
  };
}

// Requête signée générique. Le body est sérialisé UNE seule fois afin que la
// signature corresponde byte-for-byte au corps réellement envoyé.
async function signedRequest(method, path, body) {
  const payload = body ? JSON.stringify(body) : "";
  const headers = authHeadersForPayload(payload);
  const response = await axios.request({
    method,
    url: `${baseUrl()}${path}`,
    headers,
    data: body ? payload : undefined,
  });
  return response.data;
}

// GET /api/whoami — valide les identifiants et renvoie les infos du client.
async function whoami() {
  return signedRequest("GET", "/api/whoami");
}

// POST /api/customers — crée un profil client.
// Requis : email, customer_type ('individual' | 'business').
async function createCustomer(payload) {
  return signedRequest("POST", "/api/customers", payload);
}

// POST /api/lightning/invoices — génère une facture Lightning (BOLT11).
// Requis : amount (sats), description, reference (clé d'idempotence).
// Optionnel : customer_id, expiry (secondes).
async function createLightningInvoice(payload) {
  return signedRequest("POST", "/api/lightning/invoices", payload);
}

// GET /api/lightning/invoices/:id — détail/statut d'une facture.
async function getLightningInvoice(id) {
  return signedRequest("GET", `/api/lightning/invoices/${id}`);
}

// POST /api/lightning/invoices/:id/simulate-payment — (sandbox uniquement) déclenche un
//   paiement simulé sur une facture Lightning ouverte. Provoque l'émission d'un webhook
//   btc.lightning.received.success (~2 s) côté Bitnob, qui pilote ensuite la liquidation.
//   La facture doit être impayée et non expirée (sinon 4xx).
async function simulateLightningPayment(invoiceId) {
  if (!invoiceId) {
    throw new Error("simulateLightningPayment : le champ 'invoiceId' est requis.");
  }
  return signedRequest("POST", `/api/lightning/invoices/${invoiceId}/simulate-payment`);
}

// Vérifie la signature d'un webhook Bitnob.
//   En-tête : x-bitnob-signature = HMAC du corps brut, en hex.
//   `rawBody` doit être le corps EXACT reçu (chaîne), pas le JSON reparsé.
//   [NOTE DOC] La doc Bitnob est ambiguë : HMAC-SHA512 (webhooks/stablecoins) mais aussi
//   HMAC-SHA256 (security best practices), et le « secret » peut être soit
//   BITNOB_WEBHOOK_SECRET soit BITNOB_CLIENT_SECRET. Plutôt que de parier sur une seule
//   combinaison, on teste toutes les paires (secret × algorithme) : si l'une matche, le
//   webhook est authentique. services/webhookDebug.js journalise le combo exact reçu.
//   Comparaison à temps constant pour éviter les attaques temporelles.
// Retourne true/false, ou null si AUCUN secret n'est configuré.
function verifyWebhookSignature(rawBody, signature) {
  const secrets = [
    process.env.BITNOB_WEBHOOK_SECRET,
    process.env.BITNOB_CLIENT_SECRET,
  ].filter(Boolean);
  if (secrets.length === 0) return null;
  if (!signature) return false;

  const algos = ["sha512", "sha256"];
  const received = Buffer.from(String(signature).toLowerCase(), "utf8");

  for (const secret of secrets) {
    for (const algo of algos) {
      const expected = Buffer.from(
        crypto.createHmac(algo, secret).update(rawBody || "", "utf8").digest("hex"),
        "utf8"
      );
      if (expected.length === received.length && crypto.timingSafeEqual(expected, received)) {
        return true;
      }
    }
  }
  return false;
}

/* ==================================================================
 * [ÉTAPE 5] — Payouts Mobile Money (liquidation FCFA)
 * Flux Bitnob : Create Quote → Initialize (bénéficiaire) → Finalize.
 * ================================================================== */

// Mapping opérateur Mobile Money -> réseau attendu par l'API payouts.
// Valeurs confirmées le 2026-10-17 contre le sandbox :
// GET /api/payouts/supported-countries/SN → orange | free | expresso | wave.
const MOBILE_MONEY_NETWORKS = {
  wave: "wave",
  orange: "orange",
  free: "free",
  expresso: "expresso",
};

// GET /api/payouts/banks/:countryCode — annuaire des opérateurs/banques d'un pays.
// Utile pour valider les codes réseau avant un payout réel.
async function getPayoutBanks(countryCode) {
  return signedRequest("GET", `/api/payouts/banks/${countryCode}`);
}

// POST /api/payouts/quotes — crée un quote de conversion BTC -> fiat.
//   Soit `amount` (BTC côté crypto), soit `settlement_amount` (montant fiat cible
//   que le bénéficiaire doit recevoir) — jamais les deux.
//   source: "offchain" (débit du wallet Bitnob après réception Lightning).
async function createPayoutQuote({
  settlementAmount,
  amount,
  country = "SN",
  fromAsset = "BTC",
  toCurrency = "XOF",
  source = "offchain",
  reference,
}) {
  if (!reference) {
    throw new Error("createPayoutQuote : le champ 'reference' est requis.");
  }
  if (!settlementAmount && !amount) {
    throw new Error(
      "createPayoutQuote : fournir 'settlementAmount' (fiat) ou 'amount' (crypto)."
    );
  }

  const payload = {
    country,
    from_asset: fromAsset,
    to_currency: toCurrency,
    source,
    reference,
  };
  // `amount` prioritaire sur `settlesetlement_amount` côté API — on n'envoie qu'un seul.
  if (amount) payload.amount = String(amount);
  else payload.settlement_amount = String(settlementAmount);

  const response = await signedRequest("POST", "/api/payouts/quotes", payload);
  return response?.data?.payout || response?.data || response;
}

// POST /api/payouts/:quoteId/initialize — verrouille le quote et attache le
// bénéficiaire (ici : wallet Mobile Money — destination_type "mobile_money").
//   Requis par supported-countries/SN : beneficiary { account_name, account_number,
//   network } + sender { account_name, country } (champ `network`, pas `bank_code`).
//   payment_reason : code court ("goods_and_services", "family_support"…).
async function initializePayout(
  quoteId,
  {
    reference,
    beneficiary,
    sender,
    paymentReason = "goods_and_services",
    callbackUrl,
  }
) {
  if (!quoteId) {
    throw new Error("initializePayout : le champ 'quoteId' est requis.");
  }
  if (!reference) {
    throw new Error("initializePayout : le champ 'reference' est requis.");
  }
  if (!beneficiary?.account_number || !beneficiary?.network) {
    throw new Error(
      "initializePayout : beneficiary.network et beneficiary.account_number sont requis."
    );
  }

  const payload = {
    quote_id: quoteId,
    reference,
    payment_reason: paymentReason,
    beneficiary: {
      destination_type: "mobile_money",
      country: beneficiary.country || "SN",
      network: beneficiary.network,
      account_name: beneficiary.account_name || "Marchand Teranga",
      account_number: beneficiary.account_number,
      // Requis par l'API (supported-countries/SN) : identité de l'expéditeur.
      sender: {
        account_name: sender?.account_name || "Teranga Pay",
        country: sender?.country || "SN",
      },
    },
  };
  if (callbackUrl) payload.callback_url = callbackUrl;

  const response = await signedRequest(
    "POST",
    `/api/payouts/${quoteId}/initialize`,
    payload
  );
  return response?.data?.payout || response?.data || response;
}

// POST /api/payouts/:quoteId/finalize — exécute réellement le payout.
//   Doit être appelé avant expires_at (renvoyé à l'initialize).
async function finalizePayout(quoteId) {
  if (!quoteId) {
    throw new Error("finalizePayout : le champ 'quoteId' est requis.");
  }
  const response = await signedRequest("POST", `/api/payouts/${quoteId}/finalize`);
  return response?.data?.payout || response?.data || response;
}

// Enchaîne les 3 étapes du payout Mobile Money.
//   `provider` : identifiant opérateur côté produit ("wave" | "orange" | "free" | "expresso").
//   Le mapping vers le `network` Bitnob est fait via MOBILE_MONEY_NETWORKS ;
//   `network` passé explicitement surcharge ce mapping.
//   Retourne l'objet payout finalisé (statut PENDING — le dénouement arrive
//   via le webhook payouts.withdrawal.success / payouts.withdrawal.expired).
async function sendMobileMoneyPayout({
  settlementAmount,
  amount,
  phone,
  accountName = "Marchand Teranga",
  provider,
  network,
  country = "SN",
  toCurrency = "XOF",
  reference,
  sender,
  paymentReason,
  callbackUrl,
}) {
  if (!phone) {
    throw new Error("sendMobileMoneyPayout : le champ 'phone' (numéro marchand) est requis.");
  }

  const resolvedNetwork =
    network || MOBILE_MONEY_NETWORKS[String(provider || "").toLowerCase()] || null;
  if (!resolvedNetwork) {
    throw new Error(
      `sendMobileMoneyPayout : réseau inconnu pour provider="${provider}" — utilisez wave, orange, free ou expresso.`
    );
  }

  // 1. Quote — fixe le taux de conversion.
  const quote = await createPayoutQuote({
    settlementAmount,
    amount,
    country,
    toCurrency,
    reference,
  });
  const quoteId = quote?.quote_id || quote?.id;
  if (!quoteId) {
    throw new Error("sendMobileMoneyPayout : quote_id absent de la réponse du quote.");
  }

  // 2. Initialize — attache le wallet Mobile Money du marchand.
  const initiated = await initializePayout(quoteId, {
    reference,
    sender,
    paymentReason,
    callbackUrl,
    beneficiary: {
      destination_type: "mobile_money",
      country,
      network: resolvedNetwork,
      account_name: accountName,
      account_number: phone,
    },
  });

  // 3. Finalize — débite le wallet et soumet le payout au rail Mobile Money.
  const finalized = await finalizePayout(quoteId);

  return { quote, initiated, finalized };
}

module.exports = {
  DEFAULT_BITNOB_BASE_URL,
  baseUrl,
  MOBILE_MONEY_NETWORKS,
  generateNonce,
  buildSignature,
  authHeadersForPayload,
  signedRequest,
  whoami,
  createCustomer,
  createLightningInvoice,
  getLightningInvoice,
  simulateLightningPayment,
  verifyWebhookSignature,
  getPayoutBanks,
  createPayoutQuote,
  initializePayout,
  finalizePayout,
  sendMobileMoneyPayout,
};
