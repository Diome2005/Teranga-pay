# Teranga Pay — Design System (Landing Page)

Référence visuelle pour les développeurs front. Aucune couleur personnalisée n'est définie :
tout repose sur la **palette par défaut de Tailwind CSS**. Thème sombre + accent émeraude.

---

## 1. Couleurs

| Usage | Classe Tailwind | Hex |
|---|---|---|
| Fond principal | `bg-slate-950` | `#020617` |
| Surface / carte | `bg-white/5`, `bg-white/[0.02]`, `bg-slate-900/50` | blanc 5% / 2% / `#0F172A` 50% |
| Bordure fine | `border-white/5` | blanc 5% |
| Bordure standard | `border-white/10` | blanc 10% |
| Accent principal (boutons, fond) | `emerald-500` | `#10B981` |
| Accent clair (texte, icônes, hover) | `emerald-400` | `#34D399` |
| Texte principal | `text-white` | `#FFFFFF` |
| Texte secondaire | `text-slate-300` | `#CBD5E1` |
| Texte atténué | `text-slate-400` | `#94A3B8` |
| Texte discret / labels | `text-slate-500` | `#64748B` |
| Statut « en attente » | `amber-300` / `amber-500` | `#FCD34D` / `#F59E0B` |

**Halo / glow** : `rgba(16, 185, 129, …)` (émeraude 500), utilisé dans les `box-shadow` au survol.

### Couleurs de marque (logos des canaux)

| Marque | Couleur(s) |
|---|---|
| Wave | `#38BDF8` → `#0369A1` |
| Orange Money | `#FF7900` |
| Free Money | `#E2001A` |
| Cash App | `#00D632` |
| Strike | `#6366F1` (fond `#0F172A`) |
| Phoenix | `#F97316` → `#FACC15` |
| Wallet of Satoshi | `#F59E0B` |
| Muun | `#60A5FA` → `#A78BFA` |

---

## 2. Typographie

- **Police** : pile système par défaut de Tailwind (`font-sans`), aucune police custom.
- **Graisses** : titres `font-black` / `font-bold`, sous-titres `font-semibold`, corps `font-normal`.
- **Échelle utilisée** :
  - Titre hero : `text-4xl` → `sm:text-6xl`, `leading-[1.1]`, `tracking-tight`
  - Titres de section : `text-3xl` → `sm:text-4xl`, `tracking-tight`
  - Sous-titres / labels : `text-xs` / `text-sm`, `uppercase tracking-wider`
- **Sans emoji** : utiliser exclusivement des **icônes SVG inline**.

---

## 3. Layout, espacements, rayons

- **Conteneur** : `mx-auto max-w-6xl px-6`.
- **Rythme vertical** : sections en `py-16` / `py-20` / `py-24`.
- **Rayons** :
  - Boutons / petits blocs : `rounded-lg` / `rounded-xl`
  - Cartes : `rounded-2xl`
  - Grands blocs / CTA : `rounded-3xl`
  - Pastilles : `rounded-full`

---

## 4. Composants

### Boutons
- **Primaire** : `bg-emerald-500 text-slate-950 font-bold rounded-xl px-8 py-4 hover:bg-emerald-400`
  - (petit : `px-5 py-2.5 text-sm`, ou `rounded-lg`)
- **Secondaire / outline** : `border border-white/10 text-slate-200 hover:bg-white/5`
- **Effet** : transition douce (`transition`), léger halo pour le primaire (`shadow-lg shadow-emerald-500/20`).

### Cartes
- Base : `rounded-2xl border border-white/10 bg-white/5` (ou `bg-slate-900/50`, `bg-slate-950`).
- Hover : `hover:border-emerald-400/40 hover:bg-white/[0.07]`, lift `hover:-translate-y-1`.

### Aperçus interactifs (Démonstration)
- Effet 3D : `hover:-translate-y-2 hover:scale-[1.03]` + légère rotation `group-hover:[transform:rotateX(4deg)_rotateY(-4deg)]` (avec `[perspective:1200px]`).
- Ombre lumineuse : `hover:shadow-[0_28px_80px_-24px_rgba(16,185,129,0.55)]`.
- Mobile : `active:scale-[1.01]`.

### Badges / canaux
- `flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3`.
- Hover : `hover:border-emerald-400/40 hover:bg-emerald-500/[0.06] hover:shadow-[0_0_28px_-6px_rgba(16,185,129,0.55)]`.

---

## 5. Animations (définies dans `src/index.css`)

| Classe | Effet | Durée |
|---|---|---|
| `animate-fade-in` | Apparition (opacité 0→1 + translateY 8px→0) | 0.35s |
| `animate-drift` | Dérive lente du fond Hero (translate + scale) | 16s |
| `animate-float-slow` | Flottement vertical (orbes) | 7s |

- Défilement fluide des ancres : `html { scroll-behavior: smooth; }`.
- Transitions de couleur/opacité : `transition`, `duration-300` à `duration-500`.

---

## 6. Configuration Tailwind

Aucune couleurs custom — config minimale :

```js
// tailwind.config.js
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

---

## 7. Règles à respecter

- **Faire** : fond `slate-950`, accent `emerald`, texte en nuances `slate`, surfaces `white/5` + bordures `white/10`, glow émeraude au survol.
- **Ne pas** : utiliser d'emoji, introduire d'autres couleurs d'accent, mettre du texte clair sur fond clair.
- Contraste : garantir la lisibilité du texte sur les photos (overlay `slate-950` dégradé).
