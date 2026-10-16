# Teranga Pay

PSP marchand pour la diaspora sénégalaise : le client règle en **Bitcoin Lightning**, le
marchand reçoit en **FCFA** sur son compte **Mobile Money** (Wave / Orange Money / Free Money).

> Statut : l'ensemble du travail (backend + frontend + landing page) est **fusionné dans `main`**
> et fonctionnel en **mode démo** (`DEMO_MODE=true`). La mise en production reste conditionnée à
> la confirmation des points Bitnob listés dans [À faire par l'équipe](#à-faire-par-léquipe).

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
  paiement client** (QR Lightning + paiement par carte).

### Comment ça marche

1. Le **marchand** se connecte (OTP sur son numéro Mobile Money) et crée un **lien de paiement**
   pour un montant en FCFA.
2. Le client ouvre le lien et scanne une **facture Lightning** (BOLT11 + QR), ou règle par
   **carte bancaire** (Stripe Checkout).
3. Bitnob confirme le paiement via **webhook** ; la facture passe en *payée*.
4. Teranga Pay **liquide** automatiquement le montant en FCFA vers le Mobile Money du
   marchand (Wave / Orange Money / Free Money). Le dénouement du payout est aussi remonté
   par webhook.

Le montant FCFA demandé au client est converti en satoshis (taux configurable, XOF/BTC).

### Fonctionnalités clés

- Création / listing / consultation de liens de paiement (factures Lightning BOLT11 + QR).
- Paiement client en Lightning **ou** par carte (Stripe Checkout + Apple Pay).
- Webhooks Bitnob (paiement confirmé, cycle de vie des payouts) et Stripe (carte), signés.
- Liquidation automatique en FCFA vers Wave / Orange Money / Free Money (payouts Bitnob).
- Authentification marchand **passwordless** (OTP SMS / WhatsApp + sessions).
- Persistance fichier (registres JSON) et **mode démo** (`DEMO_MODE=true`) pour tester sans
  aucune clé réelle.

---

## Prérequis

- **Node.js 18+** (utilise `fetch` global et le test runner natif `node --test`).
- **npm** (fourni avec Node.js).
- *(optionnel)* Compte **Bitnob** (sandbox) et **Stripe** pour les paiements réels.
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

Par défaut `DEMO_MODE=true` : les paiements et liquidations sont **simulés**, aucune clé
Bitnob/Stripe n'est nécessaire pour tester le parcours.

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
- « Accéder au Dashboard » → connexion marchand par OTP (en mode démo, le code est affiché).
- Créer un lien de paiement, puis ouvrir le guichet client (`/?pay=<id>`).

### Commandes utiles

| Dossier | Commande | Rôle |
|---|---|---|
| `backend` | `npm run dev` | API en rechargement auto (http://localhost:5000) |
| `backend` | `npm test` | tests e2e (santé, OTP, webhooks, payouts, Stripe) |
| `backend` | `npm run demo` | scénario de démonstration bout-en-bout |
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
│   ├── services/
│   │   ├── bitnobService.js      # API Bitnob : auth HMAC, invoices, payouts (réalisé)
│   │   ├── store.js              # persistance JSON fichier (réalisé)
│   │   ├── auth.js               # auth passwordless : OTP + sessions (réalisé)
│   │   ├── sms.js                # envoi OTP SMS/WhatsApp (Twilio / Cloud API) (réalisé)
│   │   └── stripe.js             # paiement carte : Stripe Checkout + webhook (réalisé)
│   ├── scripts/
│   │   └── demo-e2e.js           # scénario de démonstration bout-en-bout (npm run demo)
│   └── test/
│       └── server.test.js        # tests e2e (npm test)
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
            ├── Navbar.jsx             # (stub inutilisé — le dashboard a son propre en-tête)
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
| GET | `/api/whoami` | valide les identifiants Bitnob |
| POST | `/api/invoices` | crée client + facture Lightning (BOLT11 + QR) |
| GET | `/api/invoices` | liste des factures (filtres `merchantPhone` / `merchant` / `status`) |
| GET | `/api/invoices/:id` | détail d'un lien de paiement |
| GET | `/api/invoices/:id/status` | polling du statut (confirmé via Bitnob) |
| POST | `/api/invoices/:id/simulate-card` | (démo) encaissement sans paiement réel |
| POST | `/api/webhooks/bitnob` | webhook signé : `btc.lightning.received.success` → liquidation FCFA ; `payouts.withdrawal.success` / `.expired` → statut du payout |
| GET | `/api/webhooks/bitnob` | sonde du tunnel ngrok |
| POST | `/api/auth/otp` | demande un code OTP (passwordless) |
| POST | `/api/auth/otp/verify` | vérifie le code → jeton de session |
| GET | `/api/merchants/me` | profil marchand (protégé `Bearer`) |
| PUT | `/api/merchants/me` | met à jour le profil (ex. `{ shop }`) |
| POST | `/api/invoices/:id/card` | crée une session Stripe Checkout (carte / Apple Pay) |
| POST | `/api/webhooks/stripe` | webhook Stripe signé → facture payée |

Lancer + tester le backend (voir aussi [Installation & lancement](#installation--lancement)) :

```bash
cd backend
npm test        # tests e2e (santé, OTP, webhooks signés, payouts, Stripe)
npm run demo    # scénario de démonstration bout-en-bout (jury)
```

---

## Démonstration de bout en bout (jury)

`npm run demo` (backend) démarre le serveur avec un registre temporaire en `DEMO_MODE` et
joue le parcours complet **sans dépendre de Bitnob / Stripe / ngrok** :

1. **Santé** — `GET /health`.
2. **Connexion marchand passwordless** — OTP (`/api/auth/otp` → `/verify`) puis profil protégé.
3. **Création d'une facture** — lien de paiement (facture injectée dans le registre).
4. **Paiement Lightning** — webhook signé `btc.lightning.received.success` → facture **payée**
   + liquidation FCFA **simulée** vers Wave.
5. **Dénouement du payout** — webhook `payouts.withdrawal.success` → payout `completed`.
6. **Paiement carte (démo)** — `POST /invoices/:id/simulate-card` → facture payée.

Sortie : un récapitulatif `OK`/`KO` par étape, code de sortie 0 si tout passe. Le script
`backend/scripts/demo-e2e.js` peut servir de trame au scénario présenté au jury.

> En complément : le **frontend** peut être démontré sans backend (repli mode démo intégré à
> `CheckoutPage` / `MerchantDashboard`), et avec backend via le proxy Vite `npm run dev`.

---

## Envoi des codes OTP (SMS / WhatsApp)

L'envoi réel est branché dans `backend/services/auth.js` via `backend/services/sms.js` :
le premier prestataire configuré est utilisé, sinon le code est **journalisé côté serveur**
(dev / démo). En `DEMO_MODE=true`, le code est aussi renvoyé dans la réponse HTTP (`demoCode`).

| Prestataire | Variables d'environnement |
|---|---|
| Twilio (SMS) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| WhatsApp Cloud API | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` |

Sans aucune de ces variables, `activeChannel()` renvoie `console` et le parcours reste
fonctionnel (aucun crash si le prestataire est absent).

---

## À faire par l'équipe

- ~~Backend : serveur Express, routes `invoices` / `webhooks`, service `bitnobService.js`~~ ✅ **fait**
- ~~Persistance (registres factures/OTP/sessions persistants)~~ ✅ **fait** (JSON fichier, `services/store.js`)
- ~~Auth passwordless (OTP)~~ ✅ **fait** (`services/auth.js`) + envoi SMS/WhatsApp réel (`services/sms.js`)
- ~~Paiement carte (Stripe Checkout + webhook)~~ ✅ **fait** (`services/stripe.js`) — renseigner `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
- ~~Frontend : brancher `CheckoutPage` / `MerchantDashboard` sur les routes OTP et carte~~ ✅ **fait** (helpers `services/api.js`, y compris `PUT /merchants/me`)
- ~~Flux de bout en bout : lien marchand → paiement Lightning / carte → webhook → payout FCFA~~ ✅ **fait** (`npm run demo`)
- ~~Scénario de démonstration de bout en bout pour le jury~~ ✅ **fait** (`scripts/demo-e2e.js`)
- ~~Fusion dans `main` (backend + frontend + landing page)~~ ✅ **fait**

### À confirmer avant mise en production (bloquant)

- **Bitnob — signature HMAC sortante** : confirmer la chaîne signée (`CLIENT_ID:TIMESTAMP:NONCE:PAYLOAD`),
  les noms d'en-têtes et le format (hex/base64) d'après la doc officielle.
- **Bitnob — chemins des endpoints** : confirmer le préfixe versionné et les routes exactes
  (invoices, quotes, initialize, finalize, banks) ainsi que les valeurs de `network` Mobile Money.
- **Bitnob — webhook entrant** : trancher SHA512 vs SHA256 et `WEBHOOK_SECRET` vs `CLIENT_SECRET`
  (aujourd'hui `verifyWebhookSignature` teste toutes les combinaisons — temporaire).

### Améliorations optionnelles

- Garde-fou production : refuser `DEMO_MODE=true` si `NODE_ENV=production`.
- Exposer les webhooks via ngrok (`PUBLIC_URL` / `callback_url`) pour les tests réels.
- Remplacer le store JSON par une vraie base (Postgres/SQLite) si besoin — même API Map-like.
- Variables d'environnement : voir `backend/.env.example` et `frontend/.env.example`.
