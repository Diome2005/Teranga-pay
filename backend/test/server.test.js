// [FICHIER] : backend/test/server.test.js
// [RÔLE] : tests de bout en bout du backend (santé, auth OTP, webhooks signés, carte).
// [EXÉCUTION] : `npm test` (node --test). Aucun service externe requis : le store est
//   isolé dans un dossier temporaire et le mode démo est forcé pour la liquidation.

process.env.DATA_DIR = require("os").tmpdir() + require("path").sep + "teranga-test-" + Date.now();
process.env.DEMO_MODE = "true";
process.env.BITNOB_WEBHOOK_SECRET = "test_bitnob_secret";
process.env.BITNOB_CLIENT_SECRET = "test_bitnob_client_secret";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
// Chaîne vide (et non suppression) : dotenv ne réécrit pas une clé déjà présente,
// ce qui force bien le service carte "non configuré" pour le test 503.
process.env.STRIPE_SECRET_KEY = "";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const app = require("../server");
const store = require("../services/store");
const stripe = require("../services/stripe");

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server && server.close();
});

// Signature Bitnob : HMAC-SHA512(body brut, secret) en hex.
function signBitnob(body) {
  return crypto.createHmac("sha512", process.env.BITNOB_WEBHOOK_SECRET).update(body, "utf8").digest("hex");
}

async function jsonFetch(path, { method = "GET", body, headers } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// ---------------------------------------------------------------- santé
test("GET /health répond ok", async () => {
  const { status, data } = await jsonFetch("/health");
  assert.equal(status, 200);
  assert.equal(data.status, "ok");
});

// ---------------------------------------------------------------- OTP
test("Auth OTP : demande -> vérification -> session -> profil protégé", async () => {
  const phone = "771234567";

  const req = await jsonFetch("/api/auth/otp", { method: "POST", body: { phone, shop: "Boutique Test" } });
  assert.equal(req.status, 200);
  assert.equal(req.data.success, true);
  assert.ok(req.data.demoCode, "le code doit être renvoyé en mode démo");

  const verify = await jsonFetch("/api/auth/otp/verify", {
    method: "POST",
    body: { phone, code: req.data.demoCode },
  });
  assert.equal(verify.status, 200);
  assert.ok(verify.data.session?.token, "un jeton de session doit être renvoyé");

  const token = verify.data.session.token;
  const me = await jsonFetch("/api/merchants/me", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(me.status, 200);
  assert.equal(me.data.session.phone, "+221771234567");

  // Route protégée sans jeton -> 401.
  const unauthorized = await jsonFetch("/api/merchants/me");
  assert.equal(unauthorized.status, 401);
});

test("Auth OTP : code invalide rejeté", async () => {
  const phone = "779998877";
  await jsonFetch("/api/auth/otp", { method: "POST", body: { phone } });
  const bad = await jsonFetch("/api/auth/otp/verify", { method: "POST", body: { phone, code: "000000" } });
  assert.equal(bad.status, 401);
});

// ------------------------------------------------- comptes (email + mot de passe)
test("Auth compte : inscription -> session -> profil protégé", async () => {
  const email = `awa+${Date.now()}@teranga.sn`;
  const reg = await jsonFetch("/api/auth/register", {
    method: "POST",
    body: { email, password: "motdepasse123", phone: "770001122", shop: "Boutique Compte" },
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.success, true);
  assert.equal(reg.data.email, email);
  assert.ok(reg.data.session?.token, "un jeton de session doit être renvoyé");

  const me = await jsonFetch("/api/merchants/me", {
    headers: { Authorization: `Bearer ${reg.data.session.token}` },
  });
  assert.equal(me.status, 200);
  assert.equal(me.data.session.phone, "+221770001122");
});

test("Auth compte : email dupliqué et mot de passe erroné rejetés, login valide OK", async () => {
  const email = `dup+${Date.now()}@teranga.sn`;
  const first = await jsonFetch("/api/auth/register", {
    method: "POST",
    body: { email, password: "motdepasse123", phone: "770002233" },
  });
  assert.equal(first.status, 201);

  const dup = await jsonFetch("/api/auth/register", {
    method: "POST",
    body: { email, password: "motdepasse456", phone: "770002244" },
  });
  assert.equal(dup.status, 400);

  const bad = await jsonFetch("/api/auth/login", {
    method: "POST",
    body: { email, password: "mauvais-mdp" },
  });
  assert.equal(bad.status, 401);

  const ok = await jsonFetch("/api/auth/login", {
    method: "POST",
    body: { email, password: "motdepasse123" },
  });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.session?.token, "le login doit renvoyer un jeton");
});

test("Auth compte : validations (email, mot de passe court, téléphone)", async () => {
  const base = { email: `val+${Date.now()}@teranga.sn`, password: "motdepasse123", phone: "770005566" };
  const badEmail = await jsonFetch("/api/auth/register", {
    method: "POST",
    body: { ...base, email: "pas-un-email" },
  });
  assert.equal(badEmail.status, 400);

  const shortPw = await jsonFetch("/api/auth/register", {
    method: "POST",
    body: { ...base, password: "court" },
  });
  assert.equal(shortPw.status, 400);

  const badPhone = await jsonFetch("/api/auth/register", {
    method: "POST",
    body: { ...base, phone: "123" },
  });
  assert.equal(badPhone.status, 400);
});

// ------------------------------------------------- factures scopées au compte
test("Factures : 401 sans jeton, création/liste scopées au compte connecté", async () => {
  const email = `scope+${Date.now()}@teranga.sn`;
  const reg = await jsonFetch("/api/auth/register", {
    method: "POST",
    body: { email, password: "motdepasse123", phone: "770003344", shop: "Atelier Scope" },
  });
  const token = reg.data.session.token;

  // Sans jeton -> 401 (création comme liste).
  const anonList = await jsonFetch("/api/invoices");
  assert.equal(anonList.status, 401);
  const anonCreate = await jsonFetch("/api/invoices", {
    method: "POST",
    body: { amountXOF: 5000, description: "Anonyme" },
  });
  assert.equal(anonCreate.status, 401);

  // Création authentifiée (DEMO_MODE : Bitnob simulé, aucun appel réseau).
  // Un tentative d'usurpation via le body est ignorée : le marchand vient de la session.
  const created = await jsonFetch("/api/invoices", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: {
      amountXOF: 5000,
      description: "Facture scopée (test)",
      merchantPhone: "770000000",
      merchant: "Autre Marchand",
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.merchantPhone, "+221770003344");
  assert.equal(created.data.merchant, "Atelier Scope");

  // La liste du compte contient cette facture.
  const list = await jsonFetch("/api/invoices", { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(list.status, 200);
  assert.ok(list.data.invoices.some((i) => i.description === "Facture scopée (test)"));

  // Un autre compte ne la voit pas.
  const other = await jsonFetch("/api/auth/register", {
    method: "POST",
    body: { email: `other+${Date.now()}@teranga.sn`, password: "motdepasse123", phone: "770009988" },
  });
  const otherList = await jsonFetch("/api/invoices", {
    headers: { Authorization: `Bearer ${other.data.session.token}` },
  });
  assert.equal(otherList.status, 200);
  assert.ok(!otherList.data.invoices.some((i) => i.description === "Facture scopée (test)"));
});

// ---------------------------------------------------------------- webhook Bitnob
test("Webhook Bitnob signé marque la facture payée (liquidation simulée)", async () => {
  const reference = "test-ref-" + Date.now();
  // On insère directement une facture dans le registre persistant (même singleton).
  store.collection("invoices").set(reference, {
    invoiceId: "inv_test_1",
    reference,
    description: "Test paiement",
    amountSat: 1000,
    amountXOF: 5000,
    merchant: "Boutique Test",
    merchantPhone: "771234567",
    provider: "wave",
    status: "pending",
    payoutStatus: null,
    createdAt: new Date().toISOString(),
  });

  const payload = JSON.stringify({
    event: "btc.lightning.received.success",
    reference,
    amount: 1000,
    payment_hash: "ph_test",
  });

  // 1) Mauvaise signature -> 401.
  const bad = await fetch(base + "/api/webhooks/bitnob", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-bitnob-signature": "deadbeef" },
    body: payload,
  });
  assert.equal(bad.status, 401);

  // 2) Bonne signature -> 200, facture payée.
  const ok = await fetch(base + "/api/webhooks/bitnob", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-bitnob-signature": signBitnob(payload) },
    body: payload,
  });
  assert.equal(ok.status, 200);

  const status = await jsonFetch(`/api/invoices/${reference}/status`);
  assert.equal(status.data.status, "paid");
  assert.equal(status.data.payoutStatus, "simulated"); // liquidation simulée (DEMO_MODE)
});

test("Persistance : la facture survit à une relecture du store", () => {
  const reloaded = new (require("../services/store").JsonCollection)("invoices");
  const first = [...reloaded.values()][0];
  assert.ok(first, "le store JSON doit contenir au moins une facture");
});

// ------------------------------------------------- payout life cycle webhook
test("Webhook payouts.withdrawal.success confirme le payout (completed)", async () => {
  const reference = "test-payout-ref-" + Date.now();
  store.collection("invoices").set(reference, {
    invoiceId: "inv_payout_1",
    reference,
    description: "Test payout",
    amountSat: 1000,
    amountXOF: 5000,
    merchant: "Boutique Test",
    merchantPhone: "771234567",
    provider: "wave",
    status: "paid",
    payoutStatus: "simulated",
    createdAt: new Date().toISOString(),
  });

  const payload = JSON.stringify({
    event: "payouts.withdrawal.success",
    reference: `payout-${reference}`,
    data: { payout: { status: "SUCCESS" } },
  });

  const res = await fetch(base + "/api/webhooks/bitnob", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-bitnob-signature": signBitnob(payload) },
    body: payload,
  });
  assert.equal(res.status, 200);

  const status = await jsonFetch(`/api/invoices/${reference}/status`);
  assert.equal(status.data.payoutStatus, "completed");
});

test("Webhook payouts.withdrawal.expired marque le payout en échec", async () => {
  const reference = "test-payout-fail-" + Date.now();
  store.collection("invoices").set(reference, {
    invoiceId: "inv_payout_2",
    reference,
    description: "Test payout échec",
    amountSat: 1000,
    amountXOF: 5000,
    merchant: "Boutique Test",
    merchantPhone: "771234567",
    provider: "orange",
    status: "paid",
    payoutStatus: "simulated",
    createdAt: new Date().toISOString(),
  });

  const payload = JSON.stringify({
    event: "payouts.withdrawal.expired",
    reference: `payout-${reference}`,
  });
  const res = await fetch(base + "/api/webhooks/bitnob", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-bitnob-signature": signBitnob(payload) },
    body: payload,
  });
  assert.equal(res.status, 200);

  const status = await jsonFetch(`/api/invoices/${reference}/status`);
  assert.equal(status.data.payoutStatus, "failed");
});

// ---------------------------------------------------------------- SMS
test("SMS : repli console quand aucun prestataire n'est configuré", async () => {
  const prev = {
    sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_FROM,
    waToken: process.env.WHATSAPP_TOKEN,
    waPhone: process.env.WHATSAPP_PHONE_ID,
  };
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM;
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_ID;

  const sms = require("../services/sms");
  assert.equal(sms.activeChannel(), "console");
  const result = await sms.sendSms({ to: "+221771234567", message: "test" });
  assert.equal(result.ok, true);
  assert.equal(result.channel, "console");

  Object.assign(process.env, {
    TWILIO_ACCOUNT_SID: prev.sid,
    TWILIO_AUTH_TOKEN: prev.token,
    TWILIO_FROM: prev.from,
    WHATSAPP_TOKEN: prev.waToken,
    WHATSAPP_PHONE_ID: prev.waPhone,
  });
});

test("SMS : le canal Twilio est prioritaire sur WhatsApp quand configuré", () => {
  const sms = require("../services/sms");
  process.env.TWILIO_ACCOUNT_SID = "AC_test";
  process.env.TWILIO_AUTH_TOKEN = "token_test";
  process.env.TWILIO_FROM = "+123456789";
  process.env.WHATSAPP_TOKEN = "wa_test";
  process.env.WHATSAPP_PHONE_ID = "123";
  assert.equal(sms.activeChannel(), "twilio");

  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM;
  assert.equal(sms.activeChannel(), "whatsapp");

  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_ID;
});

// ---------------------------------------------------------------- Stripe (carte)
test("Signature Stripe vérifiable côté serveur (unit)", () => {
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex");
  assert.equal(stripe.verifyWebhookSignature(payload, `t=${t},v1=${sig}`), true);
  assert.equal(stripe.verifyWebhookSignature(payload, `t=${t},v1=bad`), false);
});

test("POST /api/invoices/:id/card -> 503 si Stripe non configuré", async () => {
  const { status, data } = await jsonFetch("/api/invoices/xyz/card", { method: "POST", body: {} });
  assert.equal(status, 503);
  assert.equal(data.success, false);
});

// ------------------------------------------------- debug webhook (secret × algo)
test("webhookDebug identifie la bonne combinaison secret × algorithme", () => {
  const { checkCandidates } = require("../services/webhookDebug");
  const body = JSON.stringify({ event: "btc.lightning.received.success", reference: "dbg" });

  // Signature générée avec BITNOB_WEBHOOK_SECRET en SHA-512 (cas nominal).
  const good = crypto
    .createHmac("sha512", process.env.BITNOB_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("hex");
  let res = checkCandidates(body, good).filter((r) => r.match);
  assert.equal(res.length, 1);
  assert.equal(res[0].secret, "BITNOB_WEBHOOK_SECRET");
  assert.equal(res[0].algo, "sha512");

  // Signature générée avec BITNOB_WEBHOOK_SECRET en SHA-256 : le helper doit
  // identifier la combinaison sha256 × même secret (pas sha512).
  const sha256 = crypto
    .createHmac("sha256", process.env.BITNOB_WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("hex");
  res = checkCandidates(body, sha256).filter((r) => r.match);
  assert.equal(res.length, 1);
  assert.equal(res[0].secret, "BITNOB_WEBHOOK_SECRET");
  assert.equal(res[0].algo, "sha256");

  // Signature inconnue -> aucun match.
  res = checkCandidates(body, "deadbeef").filter((r) => r.match);
  assert.equal(res.length, 0);
});

// ------------------------------------- robustesse de verifyWebhookSignature
test("verifyWebhookSignature accepte WEBHOOK_SECRET×sha512 ET CLIENT_SECRET×sha256", () => {
  const bitnob = require("../services/bitnobService");
  const body = JSON.stringify({ event: "btc.lightning.received.success", reference: "rob" });

  const a = crypto.createHmac("sha512", process.env.BITNOB_WEBHOOK_SECRET).update(body, "utf8").digest("hex");
  assert.equal(bitnob.verifyWebhookSignature(body, a), true);

  const b = crypto.createHmac("sha256", process.env.BITNOB_CLIENT_SECRET).update(body, "utf8").digest("hex");
  assert.equal(bitnob.verifyWebhookSignature(body, b), true);

  assert.equal(bitnob.verifyWebhookSignature(body, "deadbeef"), false);
});
