// [FICHIER] : backend/services/webhookDebug.js
// [RÔLE] : diagnostique la signature d'un webhook Bitnob reçu (usage temporaire/debug).
// [PROBLÈME] : la doc Bitnob est ambiguë — HMAC-SHA512 vs SHA-256, et le « secret »
//   peut être BITNOB_WEBHOOK_SECRET ou le BITNOB_CLIENT_SECRET. Ce module teste toutes
//   les combinaisons candidates contre la signature réellement reçue pour trancher.
// [USAGE] : activé par WEBHOOK_DEBUG=true (le webhook journalise alors le résultat),
//   ou via le CLI : node scripts/check-webhook-signature.js <signature> <fichier-corps>

const crypto = require("crypto");
const fs = require("fs");

// Combinaisons secrètes × algorithme à tester. Les variables d'environnement
// acceptent plusieurs secrets séparés par des virgules (plusieurs webhooks).
function candidates() {
  const secrets = [
    { name: "BITNOB_WEBHOOK_SECRET", value: process.env.BITNOB_WEBHOOK_SECRET },
    { name: "BITNOB_CLIENT_SECRET", value: process.env.BITNOB_CLIENT_SECRET },
  ]
    .filter((s) => s.value)
    .flatMap((s) => {
      const values = [];
      for (const part of String(s.value).split(",")) {
        if (!part) continue;
        const trimmed = part.trim();
        if (trimmed && trimmed !== part) values.push({ value: part, raw: true });
        if (trimmed) values.push({ value: trimmed, raw: false });
      }
      return values.map((v, index) => ({
        name:
          values.length > 1 ? `${s.name}[${index + 1}${v.raw ? ",espaces" : ""}]` : s.name,
        value: v.value,
      }));
    });

  const algos = ["sha512", "sha256"]; // la doc Bitnob cite les deux
  const list = [];
  for (const s of secrets) {
    for (const algo of algos) list.push({ secret: s.name, value: s.value, algo });
  }
  return list;
}

function compute(rawBody, secret, algo) {
  return crypto.createHmac(algo, secret).update(rawBody || "", "utf8").digest("hex");
}

// Compare (insensible à la casse) en temps constant.
function safeEqualHex(a, b) {
  const x = Buffer.from(String(a).toLowerCase(), "utf8");
  const y = Buffer.from(String(b).toLowerCase(), "utf8");
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

// Renvoie la liste des résultats { secret, algo, expected, match } pour une signature reçue.
function checkCandidates(rawBody, signatureHeader) {
  return candidates().map((c) => {
    const expected = compute(rawBody, c.value, c.algo);
    return { secret: c.secret, algo: c.algo, expected, match: safeEqualHex(expected, signatureHeader) };
  });
}

// Journalise un rapport lisible dans la console serveur.
function report(rawBody, signatureHeader, headers = {}) {
  const results = checkCandidates(rawBody, signatureHeader);
  const hits = results.filter((r) => r.match);

  console.log("=========================================================");
  console.log("[WEBHOOK DEBUG] signature reçue :", signatureHeader || "(absente)");
  console.log("[WEBHOOK DEBUG] corps           :", (rawBody || "").length, "octets");
  for (const r of results) {
    console.log(`  ${r.match ? "✔ MATCH" : "     —— "} ${r.secret} × ${r.algo}  -> ${r.expected.slice(0, 20)}…`);
  }
  if (hits.length === 0) {
    console.log("[WEBHOOK DEBUG] ✗ Aucune combinaison ne matche.");
    console.log("[WEBHOOK DEBUG]   → secret inconnu, algorithme différent, ou corps altéré (rawBody ?).");
    // Sauvegarde du corps rejeté pour analyse hors-ligne (sandbox uniquement).
    try {
      const os = require("os");
      const path = require("path");
      const dump = path.join(os.tmpdir(), "teranga-webhook-rejected.txt");
      const content = `signature: ${signatureHeader || ""}\nheaders: ${JSON.stringify(
        headers || {},
        null,
        2
      )}\n---\n${rawBody || ""}`;
      fs.writeFileSync(dump, content, "utf8");
      // Copie horodatée par signature : conserve TOUS les rejets (retries inclus).
      const short = String(signatureHeader || "sans-signature").replace(/[^a-z0-9]/gi, "").slice(0, 12);
      fs.writeFileSync(path.join(os.tmpdir(), `teranga-rejet-${short}.txt`), content, "utf8");
      console.log(`[WEBHOOK DEBUG] corps rejeté sauvegardé : ${dump}`);
    } catch {
      /* best effort */
    }
  } else {
    console.log(`[WEBHOOK DEBUG] ✓ Secret correct = ${hits[0].secret}, algorithme = ${hits[0].algo}`);
  }
  console.log("=========================================================");
  return results;
}

module.exports = { candidates, compute, safeEqualHex, checkCandidates, report };

// --- CLI autonome : node scripts/check-webhook-signature.js <signatureHex> <fichierCorps> ---
if (require.main === module) {
  require("dotenv").config();
  const [signature, bodyFile] = process.argv.slice(2);
  if (!signature || !bodyFile) {
    console.error("Usage : node scripts/check-webhook-signature.js <signatureHex> <fichierCorps>");
    process.exit(1);
  }
  const rawBody = fs.readFileSync(bodyFile, "utf8");
  const hits = report(rawBody, signature).filter((r) => r.match);
  process.exit(hits.length > 0 ? 0 : 2);
}
