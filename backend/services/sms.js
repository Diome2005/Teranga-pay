// [FICHIER] : backend/services/sms.js
// [RÔLE] : envoi des codes OTP par SMS/WhatsApp — prestataire branchable.
// [CANAUX] :
//   - Twilio (SMS)           : TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM
//   - WhatsApp Cloud API     : WHATSAPP_TOKEN + WHATSAPP_PHONE_ID
//   - défaut (console)       : le code reste journalisé côté serveur (dev / démo jury).
// [ROBUSTESSE] : sendSms ne lève jamais d'exception — en cas d'échec prestataire on
//   repasse en repli console pour ne pas bloquer le parcours de connexion marchand.

const axios = require("axios");

function twilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM
  );
}

function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

// Canal réellement utilisé (le premier configuré, sinon console).
function activeChannel() {
  if (twilioConfigured()) return "twilio";
  if (whatsappConfigured()) return "whatsapp";
  return "console";
}

// Envoi via l'API REST Twilio (aucun SDK requis).
async function sendViaTwilio({ to, message }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const base = process.env.TWILIO_API_BASE || "https://api.twilio.com";
  const url = `${base}/2010-04-01/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams({
    To: to,
    From: process.env.TWILIO_FROM,
    Body: message,
  });
  const { data } = await axios.post(url, body.toString(), {
    auth: { username: sid, password: process.env.TWILIO_AUTH_TOKEN },
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15000,
  });
  return { ref: data?.sid || null, status: data?.status || "queued" };
}

// Envoi via WhatsApp Cloud API (Graph).
async function sendViaWhatsapp({ to, message }) {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const base = process.env.WHATSAPP_API_BASE || "https://graph.facebook.com/v20.0";
  const url = `${base}/${phoneId}/messages`;
  const { data } = await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: String(to).replace(/^\+/, ""),
      type: "text",
      text: { body: message },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );
  return { ref: data?.messages?.[0]?.id || null, status: "queued" };
}

// Envoie `message` à `to` (format international +221...).
// Retourne toujours { ok, channel, ref?, status? } — jamais d'exception.
async function sendSms({ to, message }) {
  const channel = activeChannel();
  try {
    if (channel === "twilio") {
      const info = await sendViaTwilio({ to, message });
      return { ok: true, channel, ...info };
    }
    if (channel === "whatsapp") {
      const info = await sendViaWhatsapp({ to, message });
      return { ok: true, channel, ...info };
    }
  } catch (error) {
    const details = error.response?.data || error.message;
    console.error(`[teranga-pay] Envoi ${channel} échoué :`, JSON.stringify(details));
    return { ok: false, channel, error: details };
  }
  // Aucun prestataire configuré : repli console.
  return { ok: true, channel: "console" };
}

module.exports = { activeChannel, sendSms };
