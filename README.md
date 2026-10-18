# Teranga Pay

PSP marchand pour la diaspora sénégalaise : le client règle en **Bitcoin Lightning**, le
marchand reçoit en **FCFA** sur son compte **Mobile Money** (Wave / Orange Money / Free Money).

> Statut : l'ensemble du travail (backend + frontend + landing page) est **fusionné dans `main`**
> et branché uniquement sur les vraies APIs (Bitnob sandbox). La mise en production
> reste conditionnée à la confirmation des points Bitnob listés dans [À faire par l'équipe](#à-faire-par-léquipe).

---

## Description du projet

Teranga Pay est une passerelle de paiement (Payment Service Provider) pensée pour les
**marchands sénégalais** qui vendent à la **diaspora**. Le problème résolu : envoyer de
l'argent au Sénégal coûte cher et prend du temps. Teranga Pay inverse le rail : le client
paie en **Bitcoin Lightning** depuis n'importe où dans le monde (quelques secondes, frais
minimes), et le marchand est réglé en **FCFA** directement sur son **compte Mobile Money**,
sans jamais manipuler de crypto.

Le projet se compose de deux applications :

- un **backend** Node.js/Express qui expose l'API (création de liens de paiement, statut,
  webhooks, authentification marchand) et orchestre la passerelle **Bitnob** (factures
  Lightning + payouts Mobile Money) ;
- un **frontend** React/Vite avec trois parcours : page d'accueil publique, **dashboard
  marchand** (connexion passwordless par OTP, création/partage de liens) et **page de
  paiement client** (QR Lightning).

### Comment ça marche

1. Le **marchand** se connecte (OTP sur son numéro Mobile Money) et crée un **lien de paiement**
   pour un montant en FCFA.
2. Le client ouvre le lien et scanne une **facture Lightning** (BOLT11 + QR).
3. Bitnob confirme le paiement via **webhook** ; la facture passe en *payée*.
4. Teranga Pay **liquide** automatiquement le montant en FCFA vers le Mobile Money du
   marchand (Wave / Orange Money / Free Money). Le dénouement du payout est aussi remonté
   par webhook.

Le montant FCFA demandé au client est converti en satoshis (taux configurable, XOF/BTC).

### Fonctionnalités clés

- Création / listing / consultation de liens de paiement (factures Lightning BOLT11 + QR).
- Paiement client en **Bitcoin Lightning** (QR BOLT11).
- Webhooks Bitnob (paiement confirmé, cycle de vie des payouts), signés.
- Liquidation automatique en FCFA vers Wave / Orange Money / Free Money (payouts Bitnob).
- Authentification marchand **passwordless** (OTP SMS / WhatsApp + sessions).
- Persistance fichier (registres JSON) : factures, comptes marchands, sessions et codes OTP.

---

## Prérequis

- **Node.js 18+** (utilise `fetch` global et le test runner natif `node --test`).
- **npm** (fourni avec Node.js).
- *(optionnel)* Compte **Bitnob** (sandbox) pour les paiements réels.
- *(optionnel)* **ngrok** pour exposer les webhooks en local.

---

## Installation & lancement

Le projet contient **deux applications** (`backend/` et `frontend/`) : installer et lancer
chacune dans un terminal séparé.

### 1. Backend (API — port 5000)

```bash
cd backend
npm install               # installe Express, Axios, Dotenv…
copy .env.example .env     # Windows (ou : cp .env.example .env)
npm run dev               # démarre l'API sur http://localhost:5000
```

Renseigner les clés **Bitnob** (sandbox) dans `.env` pour le
parcours réel ; `npm test` fonctionne sans aucune clé grâce à un stub HTTP local.

### 2. Frontend (interface — port 5173)

```bash
cd frontend
npm install               # installe React, Vite, Tailwind, qrcode.react…
copy .env.example .env     # Windows (ou : cp .env.example .env)
npm run dev               # démarre l'interface sur http://localhost:5173
```

Le serveur Vite **proxifie `/api` vers le backend** (`:5000`), donc en local il suffit de
laisser `VITE_API_URL` vide.

### 3. Utilisation

- Ouvrir **http://localhost:5173** → page d'accueil.
- « Accéder au Dashboard » → connexion marchand par OTP (sans prestataire SMS configuré, le code est journalisé dans la console du backend).
- Créer un lien de paiement, puis ouvrir le guichet client (`/?pay=<id>`).

### Commandes utiles

| Dossier | Commande | Rôle |
|---|---|---|
| `backend` | `npm run dev` | API en rechargement auto (http://localhost:5000) |
| `backend` | `npm test` | tests e2e hors-ligne via stub Bitnob (santé, comptes, OTP, webhooks, payouts) |
| `frontend` | `npm run dev` | interface Vite (http://localhost:5173) |
| `frontend` | `npm run build` | build de production |

---

## Stack technique

- **Frontend** : React 18 + Vite + Tailwind CSS + `qrcode.react`
- **Backend** : Node.js / Express + Axios + Dotenv
- **Passerelle paiement** : Bitnob (sandbox) — Lightning + payout Mobile Money
- **Corridor cible** : XOF / Sénégal (Wave, Orange Money, Free Money, Expresso)

---

## Structure du projet

```
teranga-pay/
├── README.md
├── .gitignore
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── server.js                 # serveur Express : toutes les routes (réalisé)
│   ├── data/                     # registres JSON persistants (gitignoré)
│   ├── scripts/
│   │   ├── bitnob-relay.js       # relais local (contournement IP whitelisting) — voir DEPLOY.md
│   │   └── check-webhook-signature.js # diagnostic signature webhook (CLI)
│   ├── services/
│   │   ├── bitnobService.js      # API Bitnob : auth HMAC, invoices, payouts (réalisé)
│   │   ├── store.js              # persistance JSON fichier (réalisé)
│   │   ├── auth.js               # auth passwordless : OTP + sessions (réalisé)
│   │   ├── sms.js                # envoi OTP SMS/WhatsApp (Twilio / Cloud API) (réalisé)
│   │   └── webhookDebug.js       # diagnostic signature webhook (secret × algorithme)
│   └── test/
│       ├── server.test.js        # tests e2e hors-ligne (npm test)
│       └── bitnobStub.js         # stub HTTP de l'API Bitnob pour les tests
└── frontend/
    ├── .env.example
    ├── package.json
    ├── index.html
    ├── vite.config.js            # plugin React + proxy /api -> :5000
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── public/
    │   ├── images/               # photos du fond animé du Hero
    │   └── logos/                # logos des canaux (Wave, Orange Money, Free Money, Cash App)
    └── src/
        ├── main.jsx
        ├── App.jsx               # navigation 3 vues : landing | dashboard | checkout
        ├── index.css             # Tailwind + animations (fade, drift, float)
        └── components/
            ├── LandingPage.jsx        # PAGE D'ACCUEIL (réalisée)
            ├── MerchantDashboard.jsx  # dashboard marchand (réalisé)
            ├── MerchantAuth.jsx       # connexion passwordless (réalisée)
            ├── CheckoutPage.jsx       # page de paiement client (réalisée)
            ├── ReceiptModal.jsx       # modale de reçu (réalisée)
            └── services/api.js        # couche API centralisée axios (réalisée)
```

---

## Landing Page (page d'accueil)

Fichier : `frontend/src/components/LandingPage.jsx`.
Vue d'accueil par défaut de l'application (voir `App.jsx`). Tous les boutons d'action
principaux appellent `onEnterDashboard` pour basculer vers `MerchantDashboard`.

### Style & direction artistique

- Thème sombre `slate-950` avec accents **émeraude**, **sans aucun emoji** (icônes SVG inline).
- Emplacement de **logo dédié** dans la barre de navigation (à remplacer par le visuel de marque).

### Sections

1. **Hero (`#accueil`)** — carrousel de **vraies photos** (Dakar, Gorée, plage, pirogues) en
   fondu enchaîné avec léger zoom « Ken Burns », overlay dégradé sombre pour la lisibilité,
   orbes flottantes. Titre d'accroche : « De la diaspora au Sénégal, en quelques secondes. »,
   sous-titre, double CTA et 3 statistiques clés.
2. **Canaux pris en charge (`#canaux`)** — bandeau des partenaires :
   - Mobile Money : **Wave**, **Orange Money**, **Free Money** (logos réels en `public/logos`).
   - Portefeuilles Lightning : **Cash App**, **Strike**, **Phoenix**, **Wallet of Satoshi**, **Muun**.
   - Survol lumineux (hover glow émeraude + lift).
3. **Démonstration (`#demonstration`)** — maquettes **interactives** à onglets
   *Dashboard marchand* / *Checkout client* (aperçus en HTML, effet 3D au survol : scale, tilt,
   ombre émeraude dynamique) + un **panneau « QR code Lightning expliqué »** (grand QR +
   4 étapes numérotées).
4. **Démarche (`#demarche`)** — flux en 3 étapes :
   - `01` Création de la facture (visuel : lien de paiement).
   - `02` Scan Lightning (**QR code** intégré).
   - `03` Liquidation Mobile Money.
5. **Avantages (`#avantages`)** — Vitesse, Frais réduits, Mobile Money.
6. **CTA final** — bouton vers le Dashboard marchand.
7. **Footer** — marque + description, navigation (ancres), canaux pris en charge, action
   « Accéder au Dashboard », copyright `© 2026 Teranga Pay` / `Code & Chain Dakar 2026`.

### Navigation & interactions

- Ancres fluides (`scroll-behavior: smooth`) : `#accueil`, `#demarche`, `#canaux`,
  `#avantages`, `#demonstration`.
- Animations CSS définies dans `src/index.css` : `fadeIn`, `drift` (fond), `floatSlow` (orbes).
- Cartes/aperçus avec effets `hover`/`active` (scale, tilt 3D, halo émeraude).

---

## Endpoints backend

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/health` | sonde de santé |
| GET | `/api/whoami` | valide les identifiants Bitnob — **protégé `Bearer`** (diagnostic marchand) |
| GET | `/api/wallet/transactions` | activité récente du portefeuille BTC (`Bearer`) — proxy de `GET /api/transactions` Bitnob (`currency=BTC`) |
| POST | `/api/invoices` | crée client + facture Lightning (BOLT11 + QR) — **protégé `Bearer`** (marchand = session) |
| GET | `/api/invoices` | liste des factures **du marchand connecté** (`Bearer`), filtres `merchant` / `status` |
| GET | `/api/invoices/:id` | détail d'un lien de paiement (public, numéro marchand masqué) |
| GET | `/api/invoices/:id/status` | polling du statut (confirmé via Bitnob ; public, numéro marchand masqué) |
| POST | `/api/invoices/:id/simulate-card` | encaissement simulé côté Bitnob sandbox (valide la chaîne webhook → payout) — **protégé `Bearer`**, réservé au marchand propriétaire |
| POST | `/api/webhooks/bitnob` | webhook signé : `deposit.success` (Lightning, détail sous `data`) → liquidation FCFA ; `payouts.*` → statut du payout. Dédupliqué sur `event_id` (en-tête ou corps, registre persistant, TTL 7 j) |
| GET | `/api/webhooks/bitnob` | sonde du tunnel ngrok |
| POST | `/api/auth/register` | crée un compte marchand (email + mot de passe) → jeton de session |
| POST | `/api/auth/login` | connexion email + mot de passe → jeton de session |
| POST | `/api/auth/otp` | demande un code OTP (passwordless) |
| POST | `/api/auth/otp/verify` | vérifie le code → jeton de session |
| GET | `/api/merchants/me` | profil marchand (protégé `Bearer`) |
| PUT | `/api/merchants/me` | met à jour le profil (ex. `{ shop }`) |

Lancer + tester le backend (voir aussi [Installation & lancement](#installation--lancement)) :

```bash
cd backend
npm test        # tests e2e hors-ligne via stub Bitnob (santé, comptes, OTP, webhooks signés, payouts)
```

---

## Validation réelle (sandbox Bitnob)

Plus aucun mode démo : le parcours complet se valide contre le **sandbox Bitnob** en suivant
**[`VALIDATION-SANDBOX-BITNOB.md`](VALIDATION-SANDBOX-BITNOB.md)** (whoami → facture réelle →
`simulate-card` → webhook → payout FCFA).

`npm test` (backend) couvre le même parcours **hors-ligne** via un stub HTTP local
(`backend/test/bitnobStub.js`) qui imite l'API Bitnob : aucune clé, aucun réseau externe.

---

## Envoi des codes OTP (SMS / WhatsApp)

L'envoi réel est branché dans `backend/services/auth.js` via `backend/services/sms.js` :
le premier prestataire configuré est utilisé, sinon le code est **journalisé côté serveur**
(dev uniquement). Le code n'est **jamais renvoyé** dans la réponse HTTP.

| Prestataire | Variables d'environnement |
|---|---|
| Twilio (SMS) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| WhatsApp Cloud API | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` |

Sans aucune de ces variables, `activeChannel()` renvoie `console` et le parcours reste
fonctionnel (aucun crash si le prestataire est absent).

---

## Comptes marchands (email + mot de passe)

Deux méthodes de connexion coexistent, gérées par `backend/services/auth.js` :

1. **OTP passwordless** — `POST /api/auth/otp` → `POST /api/auth/otp/verify` (téléphone).
2. **Compte email + mot de passe** — `POST /api/auth/register` (email, mot de passe ≥ 8
   caractères, numéro Mobile Money, boutique optionnelle) puis `POST /api/auth/login`.
   Le mot de passe est haché avec **scrypt** (sel aléatoire, comparaison `timingSafeEqual`),
   jamais stocké en clair ; l'inscription crée aussi la fiche marchand si elle n'existe pas.

Les deux méthodes renvoient la même forme de session `{ email?, phone, shop, since, token }` ;
le jeton se présente en `Authorization: Bearer <token>` sur les routes protégées.

**Factures rattachées au compte** : `POST /api/invoices` et `GET /api/invoices` exigent un
jeton valide (401 sinon). Le marchand (`merchantPhone` / `merchant`) est **dérivé de la
session** — tout `merchantPhone` envoyé dans le body est ignoré (anti-usurpation), et la
liste ne renvoie que les factures du marchand connecté.

---

## À faire par l'équipe

- ~~Backend : serveur Express, routes `invoices` / `webhooks`, service `bitnobService.js`~~ ✅ **fait**
- ~~Persistance (registres factures/OTP/sessions persistants)~~ ✅ **fait** (JSON fichier, `services/store.js`)
- ~~Auth passwordless (OTP)~~ ✅ **fait** (`services/auth.js`) + envoi SMS/WhatsApp réel (`services/sms.js`)
- ~~Auth marchand email + mot de passe (scrypt) + factures scopées au compte~~ ✅ **fait** (`accounts` dans `services/auth.js`, `requireMerchant` sur `POST`/`GET /api/invoices`)
- ~~Paiement carte bancaire (checkout hébergé + webhook)~~ ❌ **retiré** — encaissement uniquement en Bitcoin Lightning
- ~~Frontend : brancher `CheckoutPage` / `MerchantDashboard` sur les routes OTP~~ ✅ **fait** (helpers `services/api.js`, y compris `PUT /merchants/me`)
- ~~Flux de bout en bout : lien marchand → paiement Lightning → webhook → payout FCFA~~ ✅ **fait** (tests `npm test` via stub Bitnob + checklist sandbox)
- ~~Suppression totale du mode démo (backend, frontend, scripts) : tout passe par les vraies APIs~~ ✅ **fait**
- ~~Fusion dans `main` (backend + frontend + landing page)~~ ✅ **fait**

### À confirmer avant mise en production (bloquant)

Validé contre la doc officielle (docs.bitnob.com) :

- ✅ **Signature HMAC sortante** : `CLIENT_ID:TIMESTAMP:NONCE:PAYLOAD` signé en HMAC-SHA256 (hex),
  en-têtes `X-Auth-Client` / `X-Auth-Timestamp` / `X-Auth-Nonce` / `X-Auth-Signature` — conforme
  (`bitnobService.js`).
- ✅ **Endpoints** : `/api/whoami`, `/api/customers`, `/api/lightning/invoices[/:id]`,
  `/api/payouts/quotes` → `/:quoteId/initialize` → `/:quoteId/finalize`, `/api/payouts/banks/:countryCode`.
- ✅ **Webhook Lightning** : événement `deposit.success` (détail imbriqué sous `data`,
  `chain="lightning"` ; alias historique `btc.lightning.received.success` supporté) ;
  signature = **HMAC-SHA512** du corps, en-tête `x-bitnob-signature`.
  Payouts : `payouts.initialized` / `payouts.processing` (non terminaux) puis succès/échec
  (`statut SUCCESS`/`COMPLETED` ou `FAILED`/`EXPIRED`). `BITNOB_WEBHOOK_SECRET` accepte
  plusieurs secrets séparés par des virgules (dashboard avec plusieurs webhooks).

Validé contre le sandbox Bitnob (2026-10-17) :

- ✅ **`whoami`** : 200, `environment: "sandbox"` — signature HMAC sortante conforme.
- ✅ **Facture Lightning réelle** : BOLT11 `lntb…` (testnet sandbox) généré via `/api/lightning/invoices`.
- ✅ **Codes réseau Mobile Money SN** : `orange` / `free` / `expresso` / `wave`
  (`GET /api/payouts/supported-countries/SN`) — `MOBILE_MONEY_NETWORKS` corrigé en conséquence.
- ✅ **Champ bénéficiaire** : `network` (+ `account_name`, `account_number` et groupe `sender`
  requis) — `bank_code` ne s'applique pas au mobile money.
- ✅ **Chaîne payout réelle** : quote → initialize → finalize acceptés (statut `PENDING`,
  `sandbox_txn_…`) ; `simulate-payment` accepté → facture passée `paid`.

Validé de bout en bout via ngrok (2026-10-18) :

- ✅ **Flux complet réel** : `simulate-payment` → détection du paiement → liquidation
  (`quote → initialize → finalize`) → webhooks `payouts.*` **signés et traités** →
  `payoutStatus = "completed"` (une facture test est allée jusqu'au bout).
- ✅ **Signature webhook** : `BITNOB_WEBHOOK_SECRET` × HMAC-SHA512 (confirmé sur les
  événements `payouts.*`). Si le webhook n'arrive pas encore, le paiement est confirmé par
  **polling** (`source=polling-bitnob`) et la liquidation se déclenche quand même.
- ✅ **Déduplication webhook** — registre persistant `webhook_events` : clé
  `x-bitnob-event-id`, repli `event_id` du corps puis SHA-256 du corps brut ; TTL 7 jours,
  purgé périodiquement. Un doublon n'est jamais retraité (réponse `duplicate: true`),
  en plus des gardes de statut.

À finaliser côté dashboard Bitnob :

- ⚠️ **Webhook en double** : un ancien webhook (secret différent) livre encore les
  `deposit.*` et se fait rejeter en 401. Supprimer l'ancien, ou empiler son secret dans
  `BITNOB_WEBHOOK_SECRET` (séparés par une virgule) — le code accepte plusieurs secrets.
- ⚠️ **Solde sandbox** : recharger le compte de démonstration avant des payouts successifs
  (`INSUFFICIENT_FUNDS` après épuisement).

Durcissements réalisés :

- `GET /api/whoami` et `POST /api/invoices/:id/simulate-card` exigent un **jeton marchand**
  (`simulate-card` vérifie en plus que la facture appartient au compte — 403 sinon).
- Routes publiques du guichet : le **numéro Mobile Money du marchand est masqué**
  (seuls le nom de boutique et les champs nécessaires au paiement sont exposés).
- 404 JSON uniforme pour toute route inconnue ; `payoutStatus = "processing"` persisté
  avant l'appel API (anti double-liquidation après redémarrage).

> Procédure de validation pas à pas (whoami → facture réelle → webhook → payout, avec les
> correctifs à appliquer selon les réponses du sandbox) : **[`VALIDATION-SANDBOX-BITNOB.md`](VALIDATION-SANDBOX-BITNOB.md)**.

### Améliorations optionnelles

- Exposer les webhooks via ngrok (`PUBLIC_URL` / `callback_url`) pour les tests réels.
- Remplacer le store JSON par une vraie base (Postgres/SQLite) si besoin — même API Map-like.
- Variables d'environnement : voir `backend/.env.example` et `frontend/.env.example`.
