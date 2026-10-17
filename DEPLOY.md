# Déploiement — Render (backend + frontend)

Le projet se déploie en **deux services** sur [Render](https://render.com) via le fichier
[`render.yaml`](render.yaml) (Blueprint) : une **API Node** et un **site statique Vite**.
Aucun secret n'est committé — les variables `sync: false` sont saisies dans le dashboard.

---

## 1. Pousser le code sur GitHub

Le dépôt distant est déjà configuré (`origin` → `https://github.com/Diome2005/Teranga-pay.git`).

```bash
git add .
git commit -m "chore(deploy): blueprint Render (backend + frontend)"
git push origin main
```

---

## 2. Créer le Blueprint Render

1. Compte Render → **New +** → **Blueprint**.
2. Sélectionner le dépôt **Teranga-Pay** (branche `main`).
3. Render lit `render.yaml` et propose les deux services :
   - `teranga-pay-backend` (Web Service, plan free)
   - `teranga-pay-frontend` (Static Site, plan free)
4. Renseigner les variables demandées (`sync: false`) :

| Service | Variable | Valeur |
|---|---|---|
| backend | `FRONTEND_URL` | URL du frontend, ex. `https://teranga-pay-frontend.onrender.com` |
| backend | `PUBLIC_URL` | URL du backend, ex. `https://teranga-pay-backend.onrender.com` |
| backend | `PAYOUT_CALLBACK_URL` | `https://teranga-pay-backend.onrender.com/api/webhooks/bitnob` |
| backend | `BITNOB_CLIENT_ID` / `BITNOB_CLIENT_SECRET` / `BITNOB_WEBHOOK_SECRET` | clés sandbox Bitnob (ou **laisser vide** pour le mode démo) |
| backend | `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | optionnel (carte bancaire) |
| frontend | `VITE_API_URL` | `https://teranga-pay-backend.onrender.com/api` |

5. **Apply** → Render build et déploie les deux services.

> Le frontend lit `VITE_API_URL` **au build** : si tu la modifies plus tard, relance un
> **Manual Deploy → Clear build cache & deploy**.

---

## 3. Mode démo (par défaut, sans clés)

`render.yaml` fixe `DEMO_MODE=true` : paiements et liquidations sont **simulés**, aucune clé
Bitnob/Stripe n'est nécessaire. Idéal pour une démo publique.

> ⚠️ Garde-fou : le backend **refuse de démarrer** si `NODE_ENV=production` **et**
> `DEMO_MODE=true`. Render positionne `NODE_ENV` automatiquement en production pour les Web
> Services — il faut donc mettre `DEMO_MODE=false` **et** renseigner les clés Bitnob pour un
> déploiement de bout en bout. Sinon, exécuter en service « démo » en surchargeant
> `NODE_ENV=development`.

---

## 4. Webhooks Bitnob (paiement réel / sandbox)

Une fois le backend en ligne, pointer les webhooks du dashboard Bitnob vers :

- Paiement Lightning : `https://teranga-pay-backend.onrender.com/api/webhooks/bitnob`
- Payouts : même URL (événements `payouts.withdrawal.*`).

Voir la procédure complète dans [`VALIDATION-SANDBOX-BITNOB.md`](VALIDATION-SANDBOX-BITNOB.md).

---

## 5. Persistance (limite plan gratuit)

Le backend stocke ses registres JSON dans `backend/data/`. Sur le plan **free** de Render le
système de fichiers est **éphémère** : les données repartent à zéro à chaque redéploiement.
Pour une démo c'est acceptable ; pour persister, ajouter un **Render Disk** monté sur
`/opt/render/project/src/backend/data` (plan payant) ou migrer vers une base externe.

---

## Options d'hébergement (combinaisons possibles)

| Backend | Frontend | Fichiers fournis |
|---|---|---|
| **Render** (Web Service) | **Render** (Static Site) | [`render.yaml`](render.yaml) |
| **Railway** | **Vercel** | [`backend/railway.json`](backend/railway.json) + [`frontend/vercel.json`](frontend/vercel.json) |
| **Railway** | **Railway** (Static) | [`backend/railway.json`](backend/railway.json) |

Peu importe la combinaison, le principe reste le même :
- **backend** : `npm install` puis `npm start`, sonde `/health`, variables Bitnob (ou démo) ;
- **frontend** : `npm install && npm run build`, publier `dist/`, et `VITE_API_URL = <URL-backend>/api`.

---

### Backend sur Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → dépôt **Teranga-Pay**.
2. Service → **Settings → Root Directory** : `backend`.
3. Railway détecte Node via [`backend/railway.json`](backend/railway.json) (build `npm install`,
   start `npm start`, healthcheck `/health`).
4. **Variables** : ajouter `DEMO_MODE=true` (démo) puis les clés Bitnob/Stripe si besoin,
   ainsi que `FRONTEND_URL`, `PUBLIC_URL`, `PAYOUT_CALLBACK_URL`.
5. **Settings → Networking → Generate Domain** → noter l'URL publique
   (`https://<service>.up.railway.app`).

> Railway injecte `PORT` automatiquement — `server.js` le lit déjà (`process.env.PORT`).
> Le disque est aussi éphémère sans **Volume** monté sur `backend/data`.

### Frontend sur Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → importer le dépôt.
2. **Root Directory** : `frontend` (Framework : Vite, détecté).
3. **Environment Variables** : `VITE_API_URL = https://<backend>/api`.
4. **Deploy**.

Vercel lit [`frontend/vercel.json`](frontend/vercel.json) (build `npm run build`, sortie `dist`,
rewrite SPA `/* → /index.html`). Le fallback `frontend/public/_redirects` couvre Netlify/Render.
