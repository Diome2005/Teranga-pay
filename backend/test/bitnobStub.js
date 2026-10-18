// [FICHIER] : backend/test/bitnobStub.js
// [RÔLE] : stub HTTP local remplaçant l'API Bitnob dans les tests (aucun réseau externe).
//   Reproduit les endpoints utilisés par services/bitnobService.js avec des réponses
//   minimales mais de la même forme que les réponses réelles (data.id, data.request,
//   quote_id, payout.status…). Injecté via BITNOB_BASE_URL dans before().

const http = require("http");

let counter = 0;
function nextId(prefix) {
  counter += 1;
  return `${prefix}_${counter}`;
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => resolve(raw));
  });
}

function start() {
  return http.createServer(async (req, res) => {
    const url = req.url.split("?")[0];
    const method = req.method.toUpperCase();
    await readBody(req); // le corps n'est pas validé : le stub répond par forme.

    const json = (status, payload) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    // GET /api/whoami — infos du client Bitnob (diagnostic des clés).
    if (method === "GET" && url === "/api/whoami") {
      return json(200, { data: { id: "stub_client", environment: "sandbox" } });
    }

    // POST /api/customers — création de profil client.
    if (method === "POST" && url === "/api/customers") {
      return json(200, { data: { id: nextId("cust"), customer_type: "individual" } });
    }

    // POST /api/lightning/invoices — facture Lightning (BOLT11 factice).
    if (method === "POST" && url === "/api/lightning/invoices") {
      const id = nextId("inv");
      return json(200, {
        data: {
          id,
          request: `lnbcrt${id}`,
          payment_hash: `ph_${id}`,
          amount_sat: "1000",
          status: "pending",
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        },
      });
    }

    // POST /api/lightning/invoices/:id/simulate-payment — paiement sandbox simulé.
    if (method === "POST" && /^\/api\/lightning\/invoices\/[^/]+\/simulate-payment$/.test(url)) {
      return json(200, { data: { status: "pending" } });
    }

    // GET /api/lightning/invoices/:id — statut d'une facture.
    if (method === "GET" && /^\/api\/lightning\/invoices\/[^/]+$/.test(url)) {
      return json(200, { data: { id: url.split("/").pop(), status: "pending" } });
    }

    // GET /api/transactions — historique des transactions du compte (activité BTC).
    if (method === "GET" && url === "/api/transactions") {
      return json(200, {
        data: {
          transactions: [
            {
              transaction_id: "tx_stub_deposit",
              type: "DEPOSIT_CONFIRMED",
              side: "credit",
              amount: 2500,
              currency: "BTC",
              state: "SETTLED",
              created_at: "2026-10-17T10:00:00.000Z",
              reference: "btc-ref-stub",
              metadata: { description: "Dépôt Lightning (stub)", tx_hash: "hash_stub_deposit" },
            },
            {
              transaction_id: "tx_stub_payout",
              type: "WITHDRAWAL_SUCCESS",
              side: "debit",
              amount: 1000,
              currency: "BTC",
              state: "SETTLED",
              created_at: "2026-10-16T09:00:00.000Z",
              reference: "btc-payout-stub",
              metadata: { description: "Payout Mobile Money (stub)", tx_hash: "hash_stub_payout" },
            },
          ],
          next_cursor: "",
        },
      });
    }

    // GET /api/payouts/banks/:countryCode — annuaire opérateurs (vide suffit).
    if (method === "GET" && /^\/api\/payouts\/banks\/[^/]+$/.test(url)) {
      return json(200, { data: [] });
    }

    // POST /api/payouts/quotes — quote de conversion BTC -> XOF.
    if (method === "POST" && url === "/api/payouts/quotes") {
      return json(200, {
        data: {
          payout: {
            quote_id: nextId("quote"),
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          },
        },
      });
    }

    // POST /api/payouts/:quoteId/initialize — attache le bénéficiaire Mobile Money.
    if (method === "POST" && /^\/api\/payouts\/[^/]+\/initialize$/.test(url)) {
      return json(200, { data: { payout: { id: nextId("payout"), status: "PENDING" } } });
    }

    // POST /api/payouts/:quoteId/finalize — soumet le payout au rail.
    if (method === "POST" && /^\/api\/payouts\/[^/]+\/finalize$/.test(url)) {
      return json(200, {
        data: {
          payout: {
            status: "PENDING",
            settlement_amount: 5000,
            fees: { amount: 50, currency: "XOF" },
            exchange_rate: 1,
          },
        },
      });
    }

    return json(404, { detail: `Stub Bitnob : route inconnue ${method} ${url}` });
  });
}

module.exports = { start };
