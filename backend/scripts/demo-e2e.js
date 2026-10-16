// [FICHIER] : backend/scripts/demo-e2e.js
// [RÔLE] : scénario de démonstration de bout en bout pour le jury.
// [EXÉCUTION] : node scripts/demo-e2e.js  (ou `npm run demo`).
//
// Le script démarre le backend en mémoire (mode démo, store temporaire) puis joue
// le parcours complet, sans dépendre de Bitnob / Stripe / ngrok :
//   1. Santé du serveur
//   2. Connexion marchand passwordless (OTP)
//   3. Création d'une facture (injectée dans le registre, comme le ferait Bitnob)
//   4. Paiement Lightning  -> webhook signé  -> facture payée + liquidation FCFA (simulée)
//   5. Dénouement du payout -> webhook payouts.withdrawal.success -> payout "completed"
//   6. Paiement carte (démo) -> POST /simulate-card -> facture payée
//
// Sortie : un récapitulatif lisible. Code de sortie 0 si tout passe, 1 sinon.

process.env.DATA_DIR = require("os").tmpdir() + require("path").sep + "teranga-demo-" + Date.now();
process.env.DEMO_MODE = "true";
process.env.BITNOB_WEBHOOK_SECRET = process.env.BITNOB_WEBHOOK_SECRET || "demo_webhook_secret";
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_demo_secret";

const crypto = require("crypto");
const app = require("../server");
const store = require("../services/store");

const invoices = store.collection("invoices");
let failures = 0;

function log(step, message) {
  console.log(`\n[${step}] ${message}`);
}

function check(label, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "OK " : "KO "} ${label}${detail ? " — " + detail : ""}`);
  return ok;
}

function signBitnob(body) {
  return crypto
    .createHmac("sha512", process.env.BITNOB_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("hex");
}

let base;

async function jsonFetch(path, { method = "GET", body, headers } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function signedWebhook(payload) {
  const body = JSON.stringify(payload);
  const res = await fetch(base + "/api/webhooks/bitnob", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-bitnob-signature": signBitnob(body) },
    body,
  });
  return res.status;
}

// Injecte une facture "pending" dans le registre (équivalent d'un POST /api/invoices réussi).
function seedInvoice(reference, { amountXOF = 25000, provider = "wave", merchantPhone = "771234567" } = {}) {
  const entry = {
    invoiceId: "inv_" + reference,
    reference,
    description: "Robe brodée taille M",
    amountSat: 41667,
    amountXOF,
    merchant: "Atelier Awa Couture",
    merchantPhone,
    provider,
    bolt11: "lnbc250u1p3demo0pp5qqqsyqcyq5rqwzqfpg9scrgwpugpzysn7j4dx9",
    paymentHash: "ph_" + reference,
    status: "pending",
    payoutStatus: null,
    paidAt: null,
    createdAt: new Date().toISOString(),
  };
  invoices.set(reference, entry);
  return entry;
}

async function main() {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;

  console.log("=========================================================");
  console.log("  TERANGA PAY — DÉMONSTRATION DE BOUT EN BOUT");
  console.log(`  backend : ${base}  (DEMO_MODE=true, store temporaire)`);
  console.log("=========================================================");

  // 1. Santé
  log("1/6", "Santé du serveur");
  const health = await jsonFetch("/health");
  check("GET /health", health.status === 200 && health.data.status === "ok");

  // 2. OTP
  log("2/6", "Connexion marchand passwordless (OTP)");
  const phone = "771234567";
  const otp = await jsonFetch("/api/auth/otp", { method: "POST", body: { phone, shop: "Atelier Awa Couture" } });
  check("demande du code OTP", otp.status === 200, `canal=${otp.data.channel}`);
  const verify = await jsonFetch("/api/auth/otp/verify", { method: "POST", body: { phone, code: otp.data.demoCode } });
  const token = verify.data.session?.token;
  check("vérification OTP -> session", verify.status === 200 && Boolean(token));
  const me = await jsonFetch("/api/merchants/me", { headers: { Authorization: `Bearer ${token}` } });
  check("profil protégé GET /merchants/me", me.status === 200 && me.data.session.phone === "+221771234567");

  // 3. Facture Lightning
  log("3/6", "Création d'une facture (lien de paiement)");
  const refLightning = "TGY-DEMO-LN-" + Date.now();
  seedInvoice(refLightning, { provider: "wave" });
  const detail = await jsonFetch(`/api/invoices/${refLightning}`);
  check("détail de la facture", detail.status === 200 && detail.data.status === "pending");

  // 4. Paiement Lightning + webhook signé + liquidation simulée
  log("4/6", "Paiement Lightning -> webhook signé -> liquidation FCFA");
  const whStatus = await signedWebhook({
    event: "btc.lightning.received.success",
    reference: refLightning,
    amount: 41667,
    payment_hash: "ph_" + refLightning,
  });
  check("webhook Lightning accepté (200)", whStatus === 200);
  await new Promise((r) => setTimeout(r, 300)); // laisse la liquidation (tâche de fond) s'exécuter
  const afterPay = await jsonFetch(`/api/invoices/${refLightning}/status`);
  check("facture marquée payée", afterPay.data.status === "paid");
  check("liquidation Mobile Money lancée", afterPay.data.payoutStatus === "simulated");

  // 5. Dénouement du payout
  log("5/6", "Dénouement du payout -> payouts.withdrawal.success");
  const payWh = await signedWebhook({
    event: "payouts.withdrawal.success",
    reference: "payout-" + refLightning,
    data: { payout: { status: "SUCCESS" } },
  });
  check("webhook paiement-accepté (200)", payWh === 200);
  const afterPayout = await jsonFetch(`/api/invoices/${refLightning}/status`);
  check("payout confirmé (completed)", afterPayout.data.payoutStatus === "completed");

  // 6. Paiement carte (démo)
  log("6/6", "Paiement carte (démo) -> POST /simulate-card");
  const refCard = "TGY-DEMO-CARD-" + Date.now();
  seedInvoice(refCard, { provider: "orange", amountXOF: 10000 });
  const card = await jsonFetch(`/api/invoices/${refCard}/simulate-card`, { method: "POST", body: {} });
  check("encaissement carte simulé", card.status === 200);
  const afterCard = await jsonFetch(`/api/invoices/${refCard}/status`);
  check("facture carte payée", afterCard.data.status === "paid");

  console.log("\n=========================================================");
  if (failures === 0) {
    console.log("  RÉSULTAT : démonstration RÉUSSIE ✅  (toutes les étapes passent)");
  } else {
    console.log(`  RÉSULTAT : ${failures} étape(s) en échec ✗`);
  }
  console.log("=========================================================");

  server.close();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("[demo-e2e] Erreur inattendue :", error);
  process.exit(1);
});
