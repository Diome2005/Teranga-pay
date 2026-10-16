// [FICHIER] : backend/scripts/check-webhook-signature.js
// [RÔLE] : vérifie hors-ligne quelle combinaison secret × algorithme correspond à une
//   signature de webhook Bitnob réellement reçue (utile quand WEBHOOK_DEBUG n'est pas actif).
// [USAGE] :
//   1. Capturer un webhook réel (ex. avec ngrok + un log, ou le flag WEBHOOK_DEBUG=true).
//   2. node scripts/check-webhook-signature.js <signatureHex> <fichierCorps.json>
//   Sortie code 0 si une combinaison match, 2 sinon.

const fs = require("fs");
const path = require("path");

// S'assurer que .env est chargé AVANT d'importer le module de debug (lit process.env).
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { report } = require("../services/webhookDebug");

const [signature, bodyFile] = process.argv.slice(2);

if (!signature || !bodyFile) {
  console.error("Usage : node scripts/check-webhook-signature.js <signatureHex> <fichierCorps>");
  process.exit(1);
}

let rawBody;
try {
  rawBody = fs.readFileSync(bodyFile, "utf8");
} catch (error) {
  console.error(`Impossible de lire le fichier de corps "${bodyFile}" :`, error.message);
  process.exit(1);
}

const hits = report(rawBody, signature).filter((r) => r.match);
process.exit(hits.length > 0 ? 0 : 2);
