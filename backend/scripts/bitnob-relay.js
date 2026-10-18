// [FICHIER] : backend/scripts/bitnob-relay.js
// [RÔLE] : relais local vers l'API Bitnob. Contourne la restriction « IP whitelisting »
//   du compte Bitnob quand le backend tourne sur un hébergeur sans IP fixe (Render) :
//   Render -> ngrok -> CE proxy (IP locale whitelistée) -> api.bitnob.com.
// [SÉCURITÉ] : toutes les requêtes doivent porter le chemin secret RELAY_SECRET
//   (sinon 404) — le tunnel ngrok est public, le secret évite l'usage par des tiers.
//   Le proxy ne relaie QUE vers https://api.bitnob.com. RELAY_SECRET est OBLIGATOIRE
//   (jamais de valeur par défaut committée) : générer une chaîne aléatoire longue.
// [USAGE] :
//   1. définir RELAY_SECRET (variable d'environnement, ex. session PowerShell) :
//        $env:RELAY_SECRET = "<chaîne aléatoire de 32+ caractères>"
//   2. node scripts/bitnob-relay.js
//   3. ngrok http 8791
//   4. Sur Render : BITNOB_BASE_URL = https://<url-ngrok>/<RELAY_SECRET>

const http = require("http");
const https = require("https");

const PORT = Number(process.env.RELAY_PORT || 8791);
const SECRET = process.env.RELAY_SECRET;
const TARGET_HOST = "api.bitnob.com";
const PREFIX = `/${SECRET}`;

if (!SECRET || SECRET.length < 16) {
  console.error(
    "[teranga-relay] RELAY_SECRET manquant ou trop court (16 caractères minimum). " +
      "Générez-en un : node -e \"console.log(require('crypto').randomBytes(24).toString('hex'))\""
  );
  process.exit(1);
}

function relay(req, res) {
  // Chemin hors du préfixe secret : on répond 404 sans rien relayer.
  if (!req.url.startsWith(PREFIX)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const path = req.url.slice(PREFIX.length) || "/";
  const headers = { ...req.headers };
  delete headers.host; // recalculé par le client HTTPS
  delete headers.connection;

  const upstream = https.request(
    {
      hostname: TARGET_HOST,
      port: 443,
      path,
      method: req.method,
      headers,
    },
    (up) => {
      console.log(`[teranga-relay] ${req.method} ${path} -> ${up.statusCode}`);
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    }
  );

  upstream.on("error", (error) => {
    console.error(`[teranga-relay] ERREUR ${req.method} ${path} :`, error.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  });

  req.pipe(upstream);
}

http.createServer(relay).listen(PORT, "127.0.0.1", () => {
  console.log(`[teranga-relay] http://127.0.0.1:${PORT}${PREFIX} -> https://${TARGET_HOST}`);
  console.log("[teranga-relay] Démarre ngrok :  ngrok http " + PORT);
});
