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

## Alternative : frontend sur Vercel

Le backend reste sur Render ; le frontend peut partir sur [Vercel](https://vercel.com) :

1. **New Project** → importer le dépôt.
2. **Root Directory** : `frontend` · **Framework** : Vite.
3. Variable d'environnement : `VITE_API_URL = https://teranga-pay-backend.onrender.com/api`.
4. Deploy.

Un fallback SPA est déjà fourni (`frontend/public/_redirects`).
