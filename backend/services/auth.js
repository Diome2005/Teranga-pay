// [FICHIER] : backend/services/auth.js
// [RÔLE] : authentification "sans mot de passe" du marchand (passwordless).
// [FLUX] : numéro Mobile Money -> code OTP (TTL) -> jeton de session.
// [SMS] : l'envoi réel (SMS/WhatsApp) dépend d'un prestataire ; par défaut le code est
//   journalisé côté serveur. En DEMO_MODE=true le code est renvoyé dans la réponse pour
//   la démonstration. Pas de dépendance externe -> aucun risque de crash.
// [SÉCURITÉ] : limité en tentatives (MAX_ATTEMPTS) + délai de renvoi (RESEND_COOLDOWN).

const crypto = require("crypto");
const { collection } = require("./store");

const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS) || 300; // 5 min
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS) || 30 * 24 * 3600; // 30 j
const RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS) || 30;
const MAX_ATTEMPTS = 5;

// Registres persistants (survivent au redémarrage).
const otps = collection("otps");
const sessions = collection("sessions");
const merchants = collection("merchants");

function nowMs() {
  return Date.now();
}

// Normalise un numéro vers le format international SN : "77 123 45 67" -> "+221771234567".
function normalizePhone(phone) {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("221")) return `+${digits}`;
  if (digits.length === 9) return `+221${digits}`;
  return raw ? `+${digits}` : "";
}

function isValidSenegalPhone(phone) {
  const p = normalizePhone(phone);
  return /^\+221\d{9}$/.test(p);
}

function randomDigits(n) {
  // 6 chiffres (crypto pour éviter un code prévisible).
  return String(crypto.randomInt(0, 10 ** n)).padStart(n, "0");
}

// Enregistre un OTP pour `phone` et le journalise (stub SMS).
function requestOtp(phoneRaw, shop) {
  const phone = normalizePhone(phoneRaw);
  if (!isValidSenegalPhone(phone)) {
    return { ok: false, error: "Numéro Mobile Money invalide (format 9 chiffres, Sénégal)." };
  }

  const existing = otps.get(phone);
  if (existing && nowMs() - existing.lastSentAt < RESEND_COOLDOWN_SECONDS * 1000) {
    const wait = Math.ceil((RESEND_COOLDOWN_SECONDS * 1000 - (nowMs() - existing.lastSentAt)) / 1000);
    return { ok: false, error: `Veuillez patienter avant de redemander un code (${wait}s).` };
  }

  const code = randomDigits(6);
  otps.set(phone, {
    phone,
    code,
    attempts: 0,
    expiresAt: nowMs() + OTP_TTL_SECONDS * 1000,
    lastSentAt: nowMs(),
    shop: shop || null,
  });

  // [SMS] Point d'extension : brancher ici un provider (Twilio / WhatsApp Cloud API…).
  console.log(`[teranga-pay] OTP envoyé vers ${phone} — code=${code} (TTL ${OTP_TTL_SECONDS}s)`);

  return {
    ok: true,
    phone,
    expiresIn: OTP_TTL_SECONDS,
    resendAfter: RESEND_COOLDOWN_SECONDS,
    // En démo, on renvoie le code pour faciliter la démonstration jury.
    demoCode: process.env.DEMO_MODE === "true" ? code : undefined,
  };
}

// Vérifie le code et crée une session si valide.
function verifyOtp(phoneRaw, codeRaw, shop) {
  const phone = normalizePhone(phoneRaw);
  const code = String(codeRaw || "").trim();
  const record = otps.get(phone);

  if (!record) {
    return { ok: false, error: "Aucun code demandé pour ce numéro. Redemandez-en un." };
  }
  if (nowMs() > record.expiresAt) {
    otps.delete(phone);
    return { ok: false, error: "Code expiré. Demandez un nouveau code." };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    otps.delete(phone);
    return { ok: false, error: "Trop de tentatives. Redemandez un nouveau code." };
  }
  if (!code || code !== record.code) {
    record.attempts += 1;
    otps.set(phone, record);
    return { ok: false, error: "Code incorrect.", attemptsLeft: MAX_ATTEMPTS - record.attempts };
  }

  // Succès : le code est consommé, une session est ouverte.
  otps.delete(phone);
  const session = createSession(phone, shop || record.shop);
  return { ok: true, phone, session };
}

// Ouvre une session et renvoie un jeton opaque.
function createSession(phone, shop) {
  const token = crypto.randomBytes(24).toString("hex");
  const session = {
    token,
    phone,
    shop: shop || "Atelier Awa Couture",
    since: new Date().toISOString(),
    expiresAt: nowMs() + SESSION_TTL_SECONDS * 1000,
  };
  sessions.set(token, session);
  // Crée (ou réutilise) la fiche marchand liée à ce numéro.
  if (!merchants.has(phone)) {
    merchants.set(phone, { phone, shop: session.shop, createdAt: session.since });
  }
  return session;
}

// Résout une session à partir du jeton (Bearer). Renvoie null si absente/expirée.
function getSession(token) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= nowMs()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

// Récupère (ou initialise) la fiche marchand par numéro.
function getMerchant(phone) {
  const key = normalizePhone(phone);
  return merchants.get(key) || null;
}

function updateMerchant(phone, patch) {
  const key = normalizePhone(phone);
  const existing = merchants.get(key) || { phone: key, createdAt: new Date().toISOString() };
  const next = { ...existing, ...patch, phone: key, updatedAt: new Date().toISOString() };
  merchants.set(key, next);
  return next;
}

// Nettoyage des entrées expirées (appelé périodiquement par le serveur).
function pruneExpired() {
  return otps.pruneExpired() + sessions.pruneExpired();
}

module.exports = {
  normalizePhone,
  isValidSenegalPhone,
  requestOtp,
  verifyOtp,
  createSession,
  getSession,
  getMerchant,
  updateMerchant,
  pruneExpired,
};
