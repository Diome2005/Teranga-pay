# Validation sandbox Bitnob — checklist pas à pas

Objectif : valider en ~15 min que l'intégration Bitnob fonctionne réellement (hors `DEMO_MODE`) —
authentification API, facture Lightning, webhook signé, liquidation Mobile Money — et trancher
les 3 inconnues listées dans le README (« À confirmer avant mise en production »).

> Sandbox uniquement : ne jamais utiliser de clés de production pour ces tests.

## Prérequis

**1. Compte + clés API Bitnob (sandbox)**
1. Créer un compte sur <https://app.bitnob.com> (email → code de confirmation → mot de passe ≥ 12 caractères).
2. Dashboard → **Settings > API Keys** → **Create Key** → générer une clé **sandbox**.
3. Copier **Client ID** + **Secret** immédiatement (le secret n'est affiché qu'une seule fois).
   Note : la base URL et le Client ID sont identiques sandbox/prod — c'est le *secret* qui
   sélectionne l'environnement. Utiliser le secret **sandbox** (pas de fonds réels ; les
   données sandbox peuvent être réinitialisées périodiquement).

**2. Secret de webhook**
- Dashboard → **Settings > Webhooks** → **Create Webhook** : URL
  `https://<id>.ngrok.app/api/webhooks/bitnob`, cocher les événements Lightning + Payouts.
- Si le dashboard affiche un secret de signature : le mettre dans `BITNOB_WEBHOOK_SECRET`.
- Sinon : laisser vide — le code teste aussi `BITNOB_CLIENT_SECRET`, et `WEBHOOK_DEBUG=true`
  indique au premier webhook le couple secret × algorithme qui valide.

**3. ngrok (tunnel HTTPS pour les webhooks)**
1. Compte gratuit sur <https://ngrok.com> → télécharger.
2. `ngrok config add-authtoken <token>` puis `ngrok http 5000`.
3. L'URL gratuite change à chaque redémarrage → la reporter dans le dashboard Bitnob et
   dans `PUBLIC_URL` / `PAYOUT_CALLBACK_URL`.

- Node ≥ 18, dépendances installées (`cd backend; npm install`).
- Besoin d'aide côté Bitnob : Discord développeurs Bitnob (<https://discord.gg/u6T52ATp6f>).

## 0. Configurer `backend/.env`

Partir de `backend/.env.example` et renseigner :

```ini
DEMO_MODE=false
BITNOB_BASE_URL=https://api.bitnob.com
BITNOB_CLIENT_ID=<clé sandbox>
BITNOB_CLIENT_SECRET=<secret sandbox>
BITNOB_WEBHOOK_SECRET=<secret webhook>
WEBHOOK_DEBUG=true                       # temporaire (diagnostic signature)

PUBLIC_URL=https://<id>.ngrok.app
PAYOUT_CALLBACK_URL=https://<id>.ngrok.app/api/webhooks/bitnob
PAYOUT_PAYMENT_REASON=goods_and_services
```

Arrêter le serveur avant de modifier `.env` (les variables sont lues au démarrage).

## 1. Démarrer backend + tunnel

```powershell
# Terminal 1
cd backend; npm run dev        # http://localhost:5000

# Terminal 2
ngrok http 5000
```

Vérifier que le tunnel atteint le webhook :

```powershell
Invoke-RestMethod https://<id>.ngrok.app/api/webhooks/bitnob
# attendu : { status = "ok", message = "Webhook Bitnob prêt..." }
```

## 2. Valider l'authentification API (`GET /api/whoami`)

Route : `backend/server.js:317` → teste clés + signature HMAC sortante.

```powershell
Invoke-RestMethod http://localhost:5000/api/whoami
```

- Attendu : **200** + infos du client Bitnob.
- Si 401 : clés erronées ou horloge système désynchronisée (la signature inclut un timestamp).

## 3. Brancher le webhook dans le dashboard Bitnob

- URL : `https://<id>.ngrok.app/api/webhooks/bitnob`
- Activer les événements Lightning (`btc.lightning.received.success`) et Payouts
  (`payouts.withdrawal.success` / `.expired`).
- Dès le premier événement reçu, `WEBHOOK_DEBUG=true` journalise le couple
  **secret × algorithme** qui valide la signature (le code teste les 4 combinaisons —
  voir `verifyWebhookSignature`, `backend/services/bitnobService.js:124`).
  Attendu : `BITNOB_WEBHOOK_SECRET` × `sha512`.

## 4. Créer un compte marchand + une facture réelle

```powershell
# Compte (email + mot de passe) → jeton de session
$reg = Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/auth/register `
  -ContentType "application/json" `
  -Body '{"email":"sandbox@teranga.sn","password":"motdepasse123","phone":"770001122","shop":"Boutique Sandbox"}'
$token = $reg.session.token

# Facture avec jeton Bearer (le marchand vient de la session, pas du body)
$inv = Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/invoices `
  -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" `
  -Body '{"amountXOF":1000,"description":"Test sandbox","provider":"wave"}'

$inv.reference    # à noter pour les étapes suivantes
$inv.bolt11       # doit être un vrai BOLT11 : commence par "lnbc" (pas "demo_")
$inv.amountSat    # sats déduits de amountXOF via XOF_PER_BTC
```

Contrôles :
- L'id interne n'est **pas** préfixé `demo_` (→ vrai appel `/api/lightning/invoices`).
- `checkout_url` pointe vers le frontend (`FRONTEND_URL`).

## 5. Payer la facture (simulate-payment) et suivre le flux

`POST /api/invoices/:id/simulate-card` appelle le vrai endpoint sandbox
`/api/lightning/invoices/:id/simulate-payment` quand `DEMO_MODE=false`
(`backend/server.js:548`).

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:5000/api/invoices/<reference>/simulate-card"
# attendu : { simulated = true, message = "Paiement simulé côté Bitnob — webhook ... en attente." }
```

Puis surveiller les logs du serveur (Terminal 1) :

1. `PAIEMENT LIGHTNING CONFIRMÉ` (webhook `btc.lightning.received.success`, ~2 s) ;
2. `LIQUIDATION FCFA SOUMISE` (quote → initialize → finalize réels, `backend/server.js:195`) ;

puis vérifier l'état :

```powershell
Invoke-RestMethod "http://localhost:5000/api/invoices/<reference>/status"
# attendu : status = "paid", payoutStatus = "done" (soumis),
#           payout.status = PENDING → COMPLETED via webhook payouts.withdrawal.success
```

En cas d'échec de liquidation, `payoutStatus = "failed"` et `payoutError` contient le détail
Bitnob (status HTTP + payload d'erreur).

## 6. Trancher les 3 inconnues (sans ngrok, depuis `backend/`)

### 6a. Codes réseau Mobile Money Sénégal

```powershell
node -e 'require("dotenv").config();require("./services/bitnobService").signedRequest("GET","/api/payouts/supported-countries/SN").then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>console.error(e.response&&e.response.status,JSON.stringify(e.response&&e.response.data)))'
```

Comparer les valeurs `network` autorisées au mapping actuel (`MOBILE_MONEY_NETWORKS`,
`backend/services/bitnobService.js:157`) et corriger si besoin.

### 6b. Annuaire des opérateurs/banques SN

```powershell
node -e 'require("dotenv").config();require("./services/bitnobService").getPayoutBanks("SN").then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>console.error(e.response&&e.response.status,JSON.stringify(e.response&&e.response.data)))'
```

### 6c. Champ bénéficiaire : `network` ou `bank_code` ?

La doc cite les deux pour `mobile_money`. La réponse de `supported-countries/SN` tranche.
Si le sandbox exige `bank_code`, adapter le payload dans `initializePayout`
(`backend/services/bitnobService.js:226-237`).

### 6d. Déduplication webhook (`event_id`)

- Repérer dans les logs l'en-tête `x-bitnob-event-id` (le debug webhook les journalise).
- Aujourd'hui l'idempotence repose sur les gardes de statut (`payoutStatus`,
  `markInvoicePaid` — anti double-payout). Si le sandbox renvoie des doublons du même
  `event_id`, ajouter un registre des événements traités dans la route webhook
  (`backend/server.js:600`), par ex. une collection `store` dédiée.

## 7. Table de correction (si écart constaté)

| Inconnue | Où dans le code | Action |
|---|---|---|
| Codes `network` SN | `backend/services/bitnobService.js:157` (`MOBILE_MONEY_NETWORKS`) | remplacer `wave` / `orange_money` / `free_money` par les valeurs exactes renvoyées par le sandbox |
| `network` vs `bank_code` | `backend/services/bitnobService.js:226-237` (`initializePayout`) | renommer le champ du bénéficiaire selon la réponse du sandbox |
| `payment_reason` SN | `backend/.env` (`PAYOUT_PAYMENT_REASON`) | si 400 « invalid payment reason », tester une autre valeur autorisée pour SN |
| Dédup `event_id` | `backend/server.js:600` (route webhook) | ajouter un registre `event_id` si doublons observés |

Après toute correction : relancer `npm test` (backend, 17/17 attendus) puis rejouer l'étape 5.

## 8. Critères de réussite

- [ ] `GET /api/whoami` → 200
- [ ] Facture créée avec un vrai `bolt11` (`lnbc…`) et un id non `demo_`
- [ ] `simulate-card` → webhook reçu, signature validée (`WEBHOOK_DEBUG`)
- [ ] `status = paid` et `payoutStatus = done` ; cycle final via `payouts.withdrawal.*`
- [ ] Codes réseau SN confirmés (ou corrigés) dans `MOBILE_MONEY_NETWORKS`
- [ ] Champ bénéficiaire confirmé (`network` vs `bank_code`)
- [ ] Aucun doublon de liquidation constaté (guardes de statut suffisantes ou dédup ajoutée)

## 9. Nettoyage après validation

- `WEBHOOK_DEBUG=false` et `DEMO_MODE=true` (chemin jury/démo, 100 % hors-ligne).
- Rappel garde-fou : `NODE_ENV=production` + `DEMO_MODE=true` → le serveur refuse de démarrer.
- Ne jamais committer `.env` (clés sandbox incluses).

## Échecs fréquents

| Symptôme | Cause probable | Correctif |
|---|---|---|
| `whoami` 401 | Clés erronées, horloge décalée | Vérifier `.env` + synchroniser l'heure système |
| `whoami` 403 `IP address not whitelisted` | Whitelist IP activée sur le compte | Dashboard → **API Settings → IP Whitelisting** → ajouter l'IP publique (`Invoke-RestMethod https://api.ipify.org`), ou désactiver la restriction en sandbox |
| Webhook `401 Invalid signature` | Mauvais secret | `WEBHOOK_DEBUG=true` → lire le couple gagnant dans les logs |
| Webhook jamais reçu | URL dashboard Bitnob obsolète | Mettre à jour l'URL ngrok dans le dashboard + `PAYOUT_CALLBACK_URL` |
| `initialize` 400 sur `network` | Code réseau inexact | Corriger `MOBILE_MONEY_NETWORKS` (étape 6a) |
| `initialize` 400 `payment_reason` | Valeur non autorisée pour SN | Changer `PAYOUT_PAYMENT_REASON` |
| `payoutStatus = failed` | Wallet sandbox vide, quote expiré, bénéficiaire invalide | Lire `payoutError` via `/status` puis relancer la facture |
