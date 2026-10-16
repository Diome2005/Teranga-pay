import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

/* ============================================================
   Teranga Pay — Page d'accueil (vitrine)
   Thème clair / sombre via variables CSS (data-theme sur <html>).
   Accent émeraude. Sans emoji (SVG inline uniquement).
   Ancres : #accueil · #demarche · #canaux · #avantages
   Sections : Hero 2 colonnes (fond animé + aperçu produit) ·
   Bandeau de logos défilant (marquee) · Canaux de paiement ·
   Démonstration interactive · Démarche (3 étapes) · Avantages ·
   CTA vers le Dashboard marchand.
   ============================================================ */

/* ---------------------- Révélation au scroll ======================= */
function Reveal({ children, delay = 0, className = "" }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------------------- Icônes utilitaires (SVG) ======================= */
function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M13 2 4 13h6l-1 9 9-11h-6l1-9z" />
    </svg>
  );
}

function IconBolt({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M13 2 4 13h6l-1 9 9-11h-6l1-9z" />
    </svg>
  );
}

function IconCheck({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconFees({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  );
}

function IconMobile({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M11 18h2M9.5 6h5" />
    </svg>
  );
}

function IconInvoice({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

function IconQr({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h7v7h-4M14 20h2" />
    </svg>
  );
}

function IconArrow({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function IconMenu({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconClose({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function IconChevronUp({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

function IconSun({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function IconMoon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

/* ============================================================
   Logos des services de paiement (marques SVG, fond transparent)
   Les visuels officiels (public/logos) sont utilisés en priorité
   via LOGO_MAP ; sinon on retombe sur ces marques vectorielles.
   ============================================================ */
function BrandMark({ brand, className }) {
  switch (brand) {
    case "wave":
      return (
        <svg viewBox="0 0 32 32" className={className} aria-label="Wave">
          <defs>
            <linearGradient id="mk-wave" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#38BDF8" />
              <stop offset="1" stopColor="#0369A1" />
            </linearGradient>
          </defs>
          <path d="M3 21c4-7.5 8.5-7.5 13 0s8.5 7.5 13 0" fill="none" stroke="url(#mk-wave)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="16" cy="10" r="3.2" fill="#38BDF8" />
        </svg>
      );

    case "orange":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <rect x="2" y="2" width="28" height="28" rx="6" fill="#FF7900" />
          <rect x="9" y="9" width="14" height="14" rx="3" fill="none" stroke="#fff" strokeWidth="2.4" />
          <path d="M6.5 16h19" stroke="#fff" strokeWidth="2.4" />
        </svg>
      );

    case "free":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M6 22 16 6l10 16" fill="none" stroke="#E2001A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 22h12" fill="none" stroke="#E2001A" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );

    case "cashapp":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <rect x="2" y="2" width="28" height="28" rx="8" fill="#00D632" />
          <path d="M16 7v18M20 10.5c-1-1.6-2.4-2.2-4-2.2-2.2 0-3.6 1.2-3.6 3 0 2 1.4 2.7 3.6 3.3 2.2.6 3.6 1.3 3.6 3.3 0 1.8-1.4 3-3.6 3-1.6 0-3-.6-4-2.2" fill="none" stroke="#06340f" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );

    case "strike":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <rect x="2" y="2" width="28" height="28" rx="8" fill="#0F172A" />
          <path d="M17 6 9 18h6l-1 8 8-12h-6l1-8z" fill="#6366F1" />
        </svg>
      );

    case "phoenix":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <defs>
            <linearGradient id="mk-phx" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#F97316" />
              <stop offset="1" stopColor="#FACC15" />
            </linearGradient>
          </defs>
          <path d="M16 3c3 5 2 8-1 11-2 2-4 4-4 7a6 6 0 0 0 12 0c0-2-1-3-2-4 3 1 5.5 3 5.5 3 0-6-4.5-9-7.5-13-1-1.5-2-3-3-4z" fill="url(#mk-phx)" />
        </svg>
      );

    case "wos":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <rect x="4" y="8" width="24" height="18" rx="4" fill="none" stroke="#F59E0B" strokeWidth="2.4" />
          <path d="M4 13h24" stroke="#F59E0B" strokeWidth="2.4" />
          <path d="M16.5 17l-2.5 4h3l-2 4 4.5-5h-3l2.5-3z" fill="#F59E0B" />
        </svg>
      );

    case "muun":
      return (
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <defs>
            <linearGradient id="mk-muun" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#60A5FA" />
              <stop offset="1" stopColor="#A78BFA" />
            </linearGradient>
          </defs>
          <circle cx="16" cy="16" r="11" fill="none" stroke="url(#mk-muun)" strokeWidth="3" />
          <circle cx="16" cy="16" r="4.5" fill="url(#mk-muun)" />
        </svg>
      );

    default:
      return null;
  }
}

/* ============================================================
   Logo Teranga Pay (visuel de marque officiel)
   Image : frontend/public/logos/teranga-pay.jpg
   ============================================================ */
function BrandLogo({ className = "" }) {
  return (
    <a href="#accueil" className={`flex items-center ${className}`}>
      <img
        src="/logos/teranga-pay.jpg"
        alt="Teranga Pay — Diaspora vers Mobile Money"
        className="h-11 w-auto rounded-lg object-contain ring-1 ring-line/10"
      />
    </a>
  );
}

/* ============================================================
   Canaux pris en charge
   ============================================================ */
const MOBILE_MONEY = [
  { name: "Wave", brand: "wave" },
  { name: "Orange Money", brand: "orange" },
  { name: "Free Money", brand: "free" },
];

const LIGHTNING_WALLETS = [
  { name: "Cash App", brand: "cashapp" },
  { name: "Strike", brand: "strike" },
  { name: "Phoenix", brand: "phoenix" },
  { name: "Wallet of Satoshi", brand: "wos" },
  { name: "Muun", brand: "muun" },
];

const ALL_CHANNELS = [...MOBILE_MONEY, ...LIGHTNING_WALLETS];

const LOGO_MAP = {
  wave: "/logos/wave.jfif",
  orange: "/logos/orange-money.jfif",
  free: "/logos/free-money.png",
  cashapp: "/logos/cash-app.jfif",
  strike: null,
  phoenix: null,
  wos: null,
  muun: null,
};

function PartnerBadge({ name, brand }) {
  const src = LOGO_MAP[brand];
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-line/10 bg-band/5 px-4 py-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-emerald-400/40 hover:bg-emerald-500/[0.06] hover:shadow-[0_0_28px_-6px_rgba(16,185,129,0.55)]">
      <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-band/5 transition-transform duration-300 group-hover:scale-110 group-hover:shadow-[0_0_24px_-8px_rgba(16,185,129,0.6)]">
        {src ? (
          <img src={src} alt={`${name} logo`} className="h-full w-full object-contain p-1" />
        ) : (
          <BrandMark brand={brand} className="h-8 w-8" />
        )}
      </span>
      <span className="text-sm font-medium text-ink-muted transition-colors group-hover:text-ink">
        {name}
      </span>
    </div>
  );
}

/* Tuile de canal (logo en pastille app + nom) */
function ChannelTile({ name, brand }) {
  const src = LOGO_MAP[brand];
  return (
    <div className="group relative flex flex-col items-center gap-3 rounded-2xl border border-line/10 bg-band/5 p-4 text-center transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40 hover:bg-emerald-500/[0.06] hover:shadow-[0_18px_40px_-18px_rgba(16,185,129,0.6)]">
      <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition-transform duration-300 group-hover:scale-110">
        {src ? (
          <img src={src} alt={`${name} logo`} className="h-full w-full object-contain p-1.5" />
        ) : (
          <BrandMark brand={brand} className="h-8 w-8" />
        )}
      </span>
      <span className="text-xs font-medium text-ink-muted transition-colors group-hover:text-ink">
        {name}
      </span>
    </div>
  );
}

/* Panneau d'un côté du corridor (client ou marchand) */
function PayPanel({ eyebrow, title, Icon, items }) {
  return (
    <div className="relative h-full overflow-hidden rounded-3xl border border-line/10 bg-card/60 p-6 backdrop-blur">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-500/10 blur-2xl" />
      <div className="relative flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-accent">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            {eyebrow}
          </p>
          <h3 className="text-base font-bold text-ink">{title}</h3>
        </div>
        <span className="ml-auto rounded-full border border-line/10 bg-band/5 px-2.5 py-1 text-[11px] font-semibold text-ink-muted">
          {items.length}
        </span>
      </div>
      <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
        {items.map((p) => (
          <ChannelTile key={p.name} {...p} />
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Aperçu produit du Hero (carte Checkout flottante)
   ============================================================ */
function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="pointer-events-none absolute -inset-8 rounded-[2.5rem] bg-emerald-500/10 blur-3xl" />

      <div className="animate-float-slow relative">
        <div className="relative overflow-hidden rounded-2xl border border-line/10 bg-card/80 p-5 shadow-[0_30px_80px_-24px_rgba(16,185,129,0.55)] backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-accent">
                <LogoMark className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <p className="text-xs font-semibold text-ink">Atelier Awa Couture</p>
                <p className="text-[10px] text-ink-faint">Lien de paiement</p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              En direct
            </span>
          </div>

          <p className="mt-5 text-center text-3xl font-black text-ink">
            25 000 <span className="text-sm font-semibold text-ink-subtle">FCFA</span>
          </p>
          <p className="mt-1 text-center text-xs text-ink-faint">Robe brodée taille M</p>

          <div className="mt-4 flex justify-center rounded-xl bg-white p-3">
            <QRCodeSVG value="lightning:teranga-pay-demo@demo" size={128} />
          </div>

          <div className="mt-4 rounded-xl bg-emerald-500 py-2.5 text-center text-sm font-bold text-slate-950">
            Payer en Bitcoin Lightning
          </div>
          <div className="mt-2 rounded-xl border border-line/10 py-2.5 text-center text-xs font-medium text-ink-muted">
            Payer par Carte / Apple Pay
          </div>
        </div>

        {/* Pastilles flottantes */}
        <div
          className="animate-float-slow absolute -left-6 top-16 rounded-xl border border-line/10 bg-card/90 px-3 py-2 shadow-xl backdrop-blur"
          style={{ animationDelay: "1.2s" }}
        >
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-accent">
            <IconCheck className="h-3.5 w-3.5" />
            Paiement reçu
          </p>
          <p className="mt-0.5 text-[10px] text-ink-subtle">+25 000 FCFA · Wave</p>
        </div>

        <div
          className="animate-float-slow absolute -right-5 bottom-24 rounded-xl border border-line/10 bg-card/90 px-3 py-2 shadow-xl backdrop-blur"
          style={{ animationDelay: "2.1s" }}
        >
          <p className="text-[11px] font-semibold text-ink">&lt; 3 s</p>
          <p className="mt-0.5 text-[10px] text-ink-subtle">Règlement Lightning</p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Maquettes d'aperçu — Dashboard marchand & Checkout client
   ============================================================ */
function WindowFrame({ children }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line/10 bg-card-2">
      <div className="flex items-center gap-1.5 border-b border-line/10 bg-band/[0.03] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-band/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-band/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-band/20" />
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function DashboardMock() {
  const rows = [
    { desc: "Robe brodée taille M", amount: "25 000", status: "Payé" },
    { desc: "Boubou homme", amount: "40 000", status: "Payé" },
    { desc: "Ensemble Wax", amount: "18 500", status: "En attente" },
  ];
  return (
    <WindowFrame>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Dashboard marchand
      </p>
      <div className="mt-4 flex gap-2">
        <div className="flex-1 rounded-lg border border-line/10 bg-band/5 px-3 py-2 text-sm text-ink-muted">
          25 000 FCFA
        </div>
        <div className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">
          Générer
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((r) => (
          <div
            key={r.desc}
            className="flex items-center justify-between rounded-lg border border-line/10 bg-band/[0.02] px-3 py-2"
          >
            <div>
              <p className="text-sm text-ink">{r.desc}</p>
              <p className="text-[11px] text-ink-faint">{r.amount} FCFA</p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                r.status === "Payé"
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "bg-amber-500/10 text-amber-500"
              }`}
            >
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </WindowFrame>
  );
}

function LinkMock() {
  return (
    <div className="mt-5 rounded-xl border border-line/10 bg-band/5 p-3">
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">Lien de paiement</p>
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-card px-3 py-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
        <span className="truncate text-xs text-ink-muted">teranga.pay/i/awa-couture-25000</span>
      </div>
      <div className="mt-2 rounded-lg bg-emerald-500 py-1.5 text-center text-xs font-semibold text-slate-950">
        Copier le lien
      </div>
    </div>
  );
}

/* Cadre téléphone (aperçu client) */
function PhoneFrame({ children }) {
  return (
    <div className="mx-auto w-[260px] rounded-[2.2rem] border border-line/10 bg-card-2 p-3 shadow-[0_30px_80px_-24px_rgba(16,185,129,0.55)]">
      <div className="relative overflow-hidden rounded-[1.7rem] border border-line/10 bg-card-2">
        <div className="absolute left-1/2 top-2 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full bg-band/20" />
        <div className="px-4 pb-6 pt-8">{children}</div>
      </div>
    </div>
  );
}

function CheckoutPhoneMock() {
  return (
    <PhoneFrame>
      <p className="text-center text-[10px] uppercase tracking-wide text-ink-faint">Paiement à</p>
      <p className="text-center text-sm font-semibold text-ink">Atelier Awa Couture</p>
      <p className="mt-2 text-center text-2xl font-black text-ink">
        25 000 <span className="text-xs font-semibold text-ink-subtle">FCFA</span>
      </p>
      <div className="mt-3 flex justify-center rounded-lg bg-white p-2.5">
        <QRCodeSVG value="lightning:teranga-pay-demo@demo" size={120} />
      </div>
      <div className="mt-3 rounded-lg bg-emerald-500 py-2 text-center text-xs font-semibold text-slate-950">
        Payer en Bitcoin Lightning
      </div>
      <div className="mt-2 rounded-lg border border-line/10 py-2 text-center text-[11px] font-medium text-ink-muted">
        Payer par Carte
      </div>
    </PhoneFrame>
  );
}

/* Contenu contextuel de la démonstration */
const DEMO_TABS = [
  {
    key: "dashboard",
    label: "Dashboard marchand",
    title: "Espace marchand",
    text: "Créez et suivez vos liens de paiement en quelques clics.",
    items: [
      "Montant en FCFA et description de la vente",
      "Lien de paiement et QR code générés instantanément",
      "Partage WhatsApp en un clic",
      "Suivi des ventes en temps réel",
    ],
  },
  {
    key: "checkout",
    label: "Checkout client",
    title: "Parcours client",
    text: "Un paiement sans friction, sans compte à créer.",
    items: [
      "Aucune inscription requise",
      "Paiement Bitcoin Lightning ou carte",
      "Confirmation en moins de 3 secondes",
      "Reçu automatique côté client",
    ],
  },
];

const QR_STEPS = [
  "Le marchand génère le QR code pour le montant en FCFA.",
  "Le client scanne le QR avec son wallet Bitcoin Lightning.",
  "Le paiement est confirmé sur le réseau Lightning en quelques secondes.",
  "Le marchand reçoit le montant en FCFA sur Wave ou Orange Money.",
];

/* ============================================================
   Contenus statiques
   ============================================================ */
const NAV = [
  { href: "#accueil", label: "Accueil" },
  { href: "#demarche", label: "Démarche" },
  { href: "#canaux", label: "Canaux" },
  { href: "#avantages", label: "Avantages" },
];

const FOOTER_NAV = [
  { href: "#accueil", label: "Accueil" },
  { href: "#canaux", label: "Canaux pris en charge" },
  { href: "#demonstration", label: "Démonstration" },
  { href: "#demarche", label: "Démarche" },
  { href: "#avantages", label: "Avantages" },
];

const FOOTER_CHANNELS = [
  "Wave",
  "Orange Money",
  "Free Money",
  "Cash App · Strike · Phoenix",
  "Wallet of Satoshi · Muun",
];

/* Photos d'arrière-plan du Hero (fichiers dans public/images) */
const HERO_IMAGES = [
  "/images/dakar-city.jpg",
  "/images/street.jpg",
  "/images/beach.jpg",
  "/images/pirogues.jpg",
];

/* Image de fond globale de la page (faible opacité) */
const PAGE_BG = "/images/dakar-city.jpg";

const ADVANTAGES = [
  {
    Icon: IconBolt,
    title: "Vitesse",
    text: "Règlement en moins de 3 secondes grâce au réseau Bitcoin Lightning, sans les délais des transferts classiques.",
  },
  {
    Icon: IconFees,
    title: "Frais réduits",
    text: "Des commissions minimales et transparentes, bien en dessous des solutions de transfert traditionnelles.",
  },
  {
    Icon: IconMobile,
    title: "Mobile Money",
    text: "Fonds liquidés directement en FCFA sur Wave ou Orange Money, au coeur de l'écosystème sénégalais.",
  },
];

const STEPS = [
  {
    Icon: IconInvoice,
    number: "01",
    title: "Création de la facture",
    text: "Le marchand saisit le montant en FCFA et génère un lien de paiement unique à partager.",
  },
  {
    Icon: IconQr,
    number: "02",
    title: "Scan Lightning",
    text: "Le client de la diaspora ouvre le lien et paie en Bitcoin Lightning via QR code ou carte.",
  },
  {
    Icon: IconMobile,
    number: "03",
    title: "Liquidation Mobile Money",
    text: "Le montant est liquidé en FCFA sur le compte Wave ou Orange Money du marchand.",
  },
];

/* ============================================================
   Composant principal
   ============================================================ */
export default function LandingPage({ onEnterDashboard }) {
  const [slide, setSlide] = useState(0);
  const [demo, setDemo] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState("accueil");
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [theme, setTheme] = useState(() =>
    typeof document !== "undefined" ? document.documentElement.dataset.theme || "dark" : "dark"
  );

  useEffect(() => {
    const timer = setInterval(() => setSlide((s) => (s + 1) % HERO_IMAGES.length), 5000);
    return () => clearInterval(timer);
  }, []);

  // Application + mémorisation du thème
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("teranga-theme", theme);
    } catch {
      /* stockage indisponible */
    }
  }, [theme]);

  // Surlignage de la section active (scrollspy)
  useEffect(() => {
    const ids = NAV.map((n) => n.href.slice(1));
    const sections = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!sections.length || typeof IntersectionObserver === "undefined") return undefined;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  // En-tête qui se solidifie + bouton retour en haut
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      setShowTop(window.scrollY > 700);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative isolate bg-base text-ink">
      {/* Image de fond globale (fixe, discrète) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.06]"
          style={{ backgroundImage: `url('${PAGE_BG}')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-base/70 via-base/85 to-base" />
      </div>

      {/* ===================== En-tête ===================== */}
      <header
        className={`sticky top-0 z-50 border-b backdrop-blur-xl transition-colors duration-300 ${
          scrolled
            ? "border-line/15 bg-base/85 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.55)]"
            : "border-line/10 bg-base/70"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <BrandLogo />

          <nav className="hidden items-center gap-8 md:flex">
            {NAV.map((item) => {
              const isActive = active === item.href.slice(1);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`relative text-sm font-medium transition-colors ${
                    isActive ? "text-accent" : "text-ink-muted hover:text-accent"
                  }`}
                >
                  {item.label}
                  <span
                    className={`absolute -bottom-1.5 left-0 h-0.5 rounded-full bg-accent transition-all duration-300 ${
                      isActive ? "w-full opacity-100" : "w-0 opacity-0"
                    }`}
                  />
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-line/10 text-ink transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-accent"
              aria-label={theme === "dark" ? "Passer au thème clair" : "Passer au thème sombre"}
              title={theme === "dark" ? "Thème clair" : "Thème sombre"}
            >
              {theme === "dark" ? <IconSun className="h-5 w-5" /> : <IconMoon className="h-5 w-5" />}
            </button>

            <button
              onClick={onEnterDashboard}
              className="hidden rounded-lg border border-line/10 px-4 py-2 text-sm font-medium text-ink transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-accent sm:block"
            >
              Dashboard
            </button>

            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-line/10 text-ink transition hover:bg-band/5 md:hidden"
              aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <IconClose className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Menu mobile */}
        <div
          className={`overflow-hidden border-t border-line/10 bg-base/95 backdrop-blur-xl transition-[max-height,opacity] duration-300 md:hidden ${
            menuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-4">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-muted transition hover:bg-band/5 hover:text-accent"
              >
                {item.label}
              </a>
            ))}
            <button
              onClick={() => {
                setMenuOpen(false);
                onEnterDashboard?.();
              }}
              className="mt-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
            >
              Accéder au Dashboard
            </button>
          </nav>
        </div>
      </header>

      {/* ===================== Hero (fond animé, toujours sombre) ===================== */}
      <section id="accueil" className="relative overflow-hidden">
        {/* Carrousel d'images d'arrière-plan animé en boucle (zoom Ken Burns) */}
        <div className="absolute inset-0">
          {HERO_IMAGES.map((src, index) => (
            <div
              key={src}
              className={`absolute inset-0 origin-center transform transition-opacity duration-[2000ms] ease-in-out will-change-transform ${
                index === slide ? "opacity-100 animate-drift" : "opacity-0"
              }`}
              style={{
                backgroundImage: `url('${src}')`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                filter: "brightness(0.92)",
              }}
            />
          ))}
        </div>

        {/* Orbes flottantes */}
        <div className="pointer-events-none absolute inset-0">
          <div className="animate-float-slow absolute -left-24 top-8 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
          <div
            className="animate-float-slow absolute -right-16 top-44 h-80 w-80 rounded-full bg-teal-500/15 blur-3xl"
            style={{ animationDelay: "1.6s" }}
          />
        </div>

        {/* Overlay dégradé sombre pour la lisibilité */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-950/80 to-slate-950" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/60 to-transparent" />

        {/* Motif grille subtil */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
            backgroundSize: "52px 52px",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-24">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            {/* Colonne texte (sur fond d'image sombre -> texte clair fixe) */}
            <div className="text-center text-white lg:text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Pont Diaspora — Sénégal
              </span>

              <h1 className="mx-auto mt-7 max-w-xl text-4xl font-black leading-[1.1] tracking-tight sm:text-5xl lg:mx-0 lg:text-6xl">
                De la diaspora au Sénégal,
                <span className="gradient-text"> en quelques secondes.</span>
              </h1>

              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-300 lg:mx-0">
                Teranga Pay connecte vos clients à l'étranger à votre compte Wave ou Orange Money.
                Un lien de paiement, un règlement en Bitcoin Lightning, une réception instantanée en
                FCFA — sans application à installer.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
                <button
                  onClick={onEnterDashboard}
                  className="group inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-8 py-4 text-base font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
                >
                  Accéder au Dashboard Marchand
                  <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
                <a
                  href="#demarche"
                  className="rounded-xl border border-white/10 px-8 py-4 text-base font-semibold text-slate-200 transition hover:bg-white/5"
                >
                  Voir la démarche
                </a>
              </div>
            </div>

            {/* Colonne aperçu produit */}
            <Reveal delay={150}>
              <HeroPreview />
            </Reveal>
          </div>

          {/* Statistiques (sur fond d'image sombre) */}
          <Reveal delay={250}>
            <div className="mx-auto mt-16 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { value: "< 3 s", label: "Temps de règlement" },
                { value: "Wave · OM", label: "Réception Mobile Money" },
                { value: "Zéro app", label: "Côté client" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 backdrop-blur-sm"
                >
                  <p className="text-xl font-bold text-emerald-400">{stat.value}</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">{stat.label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== Bandeau de logos défilant ===================== */}
      <section className="border-y border-line/10 bg-band/[0.02] py-8">
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-ink-faint">
          Compatible avec les canaux que vos clients utilisent déjà
        </p>
        <div className="marquee relative overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-base to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-base to-transparent" />
          <div className="animate-marquee flex w-max items-center gap-4 px-2">
            {[...ALL_CHANNELS, ...ALL_CHANNELS].map((p, i) => (
              <div key={`${p.name}-${i}`} className="shrink-0">
                <PartnerBadge {...p} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== Canaux pris en charge ===================== */}
      <section id="canaux" className="relative overflow-hidden border-y border-line/10 bg-band/[0.02]">
        {/* Décor lumineux */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 py-20">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">Canaux</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Payer en Bitcoin, recevoir en Mobile&nbsp;Money
              </h2>
              <p className="mt-4 text-ink-subtle">
                Vos clients règlent depuis leurs portefeuilles Lightning préférés ; vous encaissez
                en FCFA sur les canaux les plus utilisés au Sénégal.
              </p>
            </div>
          </Reveal>

          <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-[1fr_auto_1fr]">
            <Reveal className="h-full">
              <PayPanel
                eyebrow="Côté client · Diaspora"
                title="Portefeuilles Lightning"
                Icon={IconBolt}
                items={LIGHTNING_WALLETS}
              />
            </Reveal>

            {/* Noeud de conversion Lightning */}
            <Reveal delay={150} className="flex items-center justify-center">
              <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-card text-accent shadow-[0_0_30px_-8px_rgba(16,185,129,0.8)]">
                <IconBolt className="h-5 w-5" />
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/20" />
              </div>
            </Reveal>

            <Reveal delay={300} className="h-full">
              <PayPanel
                eyebrow="Côté marchand · Sénégal"
                title="Mobile Money"
                Icon={IconMobile}
                items={MOBILE_MONEY}
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===================== Démonstration interactive ===================== */}
      <section id="demonstration" className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 py-24">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                Démonstration
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Du côté marchand et du côté client
              </h2>
              <p className="mt-4 text-ink-subtle">
                Basculez entre les deux interfaces pour découvrir le parcours complet, de la
                facture au reçu.
              </p>
            </div>
          </Reveal>

          {/* Sélecteur segmenté */}
          <Reveal delay={100}>
            <div className="mt-8 flex justify-center">
              <div className="inline-flex rounded-full border border-line/10 bg-card/60 p-1 backdrop-blur">
                {DEMO_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setDemo(tab.key)}
                    className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                      demo === tab.key
                        ? "bg-emerald-500 text-slate-950 shadow-[0_8px_24px_-8px_rgba(16,185,129,0.8)]"
                        : "text-ink-muted hover:text-accent"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Aperçu + caractéristiques */}
          <div className="mt-14 grid items-center gap-12 lg:grid-cols-2">
            <Reveal className="order-2 lg:order-1">
              {DEMO_TABS.filter((t) => t.key === demo).map((tab) => (
                <div key={tab.key} className="animate-fade-in">
                  <h3 className="text-2xl font-bold tracking-tight">{tab.title}</h3>
                  <p className="mt-3 text-ink-subtle">{tab.text}</p>
                  <ul className="mt-6 space-y-3">
                    {tab.items.map((item) => (
                      <li key={item} className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-accent">
                          <IconCheck className="h-3 w-3" />
                        </span>
                        <span className="text-sm text-ink-muted">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Reveal>

            <Reveal delay={150} className="order-1 lg:order-2">
              <div className="[perspective:1200px]">
                <div className="group transition-transform duration-500 will-change-transform hover:-translate-y-2 hover:scale-[1.02] group-hover:[transform:rotateX(4deg)_rotateY(-4deg)]">
                  <div key={demo} className="animate-fade-in">
                    {demo === "dashboard" ? (
                      <div className="rounded-2xl border border-line/10 bg-card/50 p-3 transition-colors duration-500 group-hover:border-emerald-400/40 group-hover:shadow-[0_28px_80px_-24px_rgba(16,185,129,0.55)]">
                        <DashboardMock />
                      </div>
                    ) : (
                      <div className="rounded-2xl p-3">
                        <CheckoutPhoneMock />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* QR explicatif — timeline */}
          <Reveal delay={150}>
            <div className="mt-16 grid max-w-4xl items-center gap-8 rounded-3xl border border-line/10 bg-card/50 p-8 sm:grid-cols-[auto_1fr] sm:p-10 mx-auto">
              <div className="mx-auto rounded-2xl bg-white p-4 shadow-[0_0_44px_-12px_rgba(16,185,129,0.6)]">
                <QRCodeSVG value="lightning:teranga-pay-demo@demo" size={168} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                  QR code Lightning expliqué
                </p>
                <h3 className="mt-2 text-lg font-bold">Comment le client paie</h3>
                <ol className="relative mt-5 space-y-4 border-l border-line/10 pl-7">
                  {QR_STEPS.map((step, i) => (
                    <li key={step} className="relative">
                      <span className="absolute -left-[2.35rem] flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-black text-slate-950">
                        {i + 1}
                      </span>
                      <span className="text-sm text-ink-subtle">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== Démarche (3 étapes) ===================== */}
      <section id="demarche" className="border-y border-line/10 bg-band/[0.02]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                Démarche
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Trois étapes, de la facture à la réception
              </h2>
            </div>
          </Reveal>

          <div className="relative mt-16 grid gap-8 md:grid-cols-3">
            {/* Ligne de temps (desktop) */}
            <span className="pointer-events-none absolute left-[16.6%] right-[16.6%] top-7 hidden h-px bg-gradient-to-r from-emerald-500/0 via-emerald-500/40 to-emerald-500/0 md:block" />

            {STEPS.map(({ Icon, number, title, text }, i) => (
              <Reveal key={number} delay={i * 120} className="h-full">
                <div className="relative h-full">
                  {/* Nœud numéroté */}
                  <span className="absolute left-1/2 top-0 z-10 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-emerald-500/30 bg-card text-accent shadow-[0_0_30px_-10px_rgba(16,185,129,0.85)]">
                    <Icon className="h-6 w-6" />
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black text-slate-950">
                      {i + 1}
                    </span>
                  </span>

                  <div className="flex h-full flex-col rounded-3xl border border-line/10 bg-card/60 p-6 pt-10 text-center backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/40">
                    <h3 className="mt-2 text-lg font-bold">{title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-ink-subtle">{text}</p>
                    <div className="mt-5 text-left">
                      {number === "01" && <LinkMock />}
                      {number === "02" && (
                        <div className="flex items-center gap-3 rounded-xl border border-line/10 bg-band/5 p-3">
                          <span className="rounded-lg bg-white p-1.5">
                            <QRCodeSVG value="lightning:teranga-pay-demo@demo" size={80} />
                          </span>
                          <span className="text-xs leading-snug text-ink-subtle">
                            Le client scanne le QR code Lightning pour payer instantanément.
                          </span>
                        </div>
                      )}
                      {number === "03" && (
                        <div className="flex items-center gap-3 rounded-xl border border-line/10 bg-band/5 p-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-accent">
                            <IconCheck className="h-5 w-5" />
                          </span>
                          <span className="text-xs leading-snug text-ink-subtle">
                            Règlement crédité sur le compte Mobile Money du marchand.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== Avantages ===================== */}
      <section id="avantages" className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">
              Avantages
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Conçu pour les marchands sénégalais
            </h2>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {ADVANTAGES.map(({ Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 120} className="h-full">
              <div className="h-full rounded-2xl border border-line/10 bg-card p-8 transition hover:border-emerald-500/30 hover:bg-band/5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-accent">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-lg font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-subtle">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===================== CTA final ===================== */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/10 to-transparent p-12 text-center">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Prêt à encaisser vos ventes ?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-ink-subtle">
                Générez votre premier lien de paiement en moins d'une minute.
              </p>
              <button
                onClick={onEnterDashboard}
                className="shine group relative mt-8 inline-flex items-center gap-2 overflow-hidden rounded-xl bg-emerald-500 px-8 py-4 text-base font-bold text-slate-950 transition hover:bg-emerald-400"
              >
                Accéder au Dashboard Marchand
                <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ===================== Pied de page ===================== */}
      <footer className="border-t border-line/10 bg-base">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-10 md:grid-cols-4">
            <div>
              <BrandLogo />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-subtle">
                Paiements marchands pour la diaspora sénégalaise. Le client règle en Bitcoin
                Lightning, le marchand reçoit en FCFA sur Mobile Money.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-ink">Navigation</p>
              <ul className="mt-4 space-y-3 text-sm text-ink-subtle">
                {FOOTER_NAV.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} className="transition-colors hover:text-accent">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-sm font-semibold text-ink">Canaux pris en charge</p>
              <ul className="mt-4 space-y-3 text-sm text-ink-subtle">
                {FOOTER_CHANNELS.map((channel) => (
                  <li key={channel}>{channel}</li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-sm font-semibold text-ink">Démarrer</p>
              <p className="mt-4 text-sm leading-relaxed text-ink-subtle">
                Générez votre premier lien de paiement en moins d'une minute.
              </p>
              <button
                onClick={onEnterDashboard}
                className="mt-4 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
              >
                Accéder au Dashboard
              </button>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-line/10 pt-8 text-sm text-ink-faint sm:flex-row">
            <p>© 2026 Teranga Pay — Tous droits réservés.</p>
            <p>Code &amp; Chain Dakar 2026</p>
          </div>
        </div>
      </footer>

      {/* ===================== Retour en haut ===================== */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Revenir en haut"
        className={`fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-emerald-500/30 bg-card/90 text-accent shadow-lg backdrop-blur transition-all duration-300 hover:bg-emerald-500 hover:text-slate-950 ${
          showTop ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        }`}
      >
        <IconChevronUp className="h-5 w-5" />
      </button>
    </div>
  );
}
