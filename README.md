# Teranga Pay

PSP marchand pour la diaspora sénégalaise : le client règle en **Bitcoin Lightning**, le
marchand reçoit en **FCFA** sur son compte **Mobile Money** (Wave / Orange Money / Free Money).

> Note de travail : la page d'accueil (Landing Page) est développée sur la branche
> **`feat/landing-page`**. Elle n'est **pas encore fusionnée dans `main`** — travail en cours,
> conservé à part pour le moment.

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
│   ├── server.js                 # serveur Express (à faire)
│   ├── routes/
│   │   ├── invoices.js           # création/liste des liens de paiement (à faire)
│   │   └── webhooks.js           # webhooks Bitnob charge.success / payouts (à faire)
│   └── services/
│       └── bitnob.js             # intégration API Bitnob : auth HMAC, invoices, payouts (à faire)
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
        ├── components/
        │   ├── LandingPage.jsx        # PAGE D'ACCUEIL (réalisée)
        │   ├── MerchantDashboard.jsx  # dashboard marchand (à faire)
        │   ├── CheckoutPage.jsx       # page de paiement client (à faire)
        │   ├── Navbar.jsx             # navbar du dashboard (à faire)
        │   └── ReceiptModal.jsx       # modale de reçu (à faire)
        └── services/
            └── api.js                 # couche API centralisée axios (à faire)
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

### Lancer le frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

---

## À faire par l'équipe

- Backend : serveur Express, routes `invoices` / `webhooks`, service `bitnob.js`
  (auth HMAC-SHA256, création d'invoices Lightning, payouts Mobile Money en 3 étapes).
- Frontend : `MerchantDashboard.jsx`, `CheckoutPage.jsx`, `Navbar.jsx`, `ReceiptModal.jsx`,
  `services/api.js`.
- Flux de bout en bout : lien marchand → paiement Lightning / carte → webhook `charge.success`
  → payout FCFA (Wave / Orange Money).
- Variables d'environnement : voir `backend/.env.example` et `frontend/.env.example`.
- Scénario de démonstration de bout en bout pour le jury.
