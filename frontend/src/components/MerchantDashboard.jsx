// [FICHIER] : frontend/src/components/MerchantDashboard.jsx
// [RÔLE] : dashboard marchand — création et suivi des liens de paiement.
// [FLUX] : le marchand saisit un montant (XOF), une description et un provider de
//          réception (Wave / Orange Money / Free Money) -> la facture est enregistrée
//          dans l'historique local (localStorage) -> il ouvre le guichet de paiement
//          (CheckoutPage) ou partage la facture à son client.
// [UI] : Tailwind CSS — tokens de thème (clair/sombre) + accent émeraude. Sans emoji.
// NOTE : espace marchand "passwordless" (identifié par le numéro Mobile Money). Les liens
//        sont créés via POST /api/invoices ; l'historique local scopé par numéro
//        (clé "teranga-invoices:<numéro>") sert de cache et de repli si le backend est absent.

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createPaymentLink, listPaymentLinks, updateMerchant } from "../services/api";

const STORAGE_PREFIX = "teranga-invoices";
const DEFAULT_SHOP = "Atelier Awa Couture";
const PAGE_BG = "/images/dakar-city.jpg";

const PROVIDERS = [
  { id: "wave", name: "Wave", logo: "/logos/wave.jfif" },
  { id: "orange", name: "Orange Money", logo: "/logos/orange-money.jfif" },
  { id: "free", name: "Free Money", logo: "/logos/free-money.png" },
];

const QUICK_AMOUNTS = [5000, 10000, 25000, 50000, 100000, 250000];

/* ---------------------- Icônes (SVG) ======================= */
function Svg({ className, children, strokeWidth = 1.8 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IconBack = (props) => (
  <Svg {...props}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </Svg>
);
const IconBolt = (props) => (
  <Svg {...props}>
    <path d="M13 2 4 13h6l-1 9 9-11h-6l1-9z" />
  </Svg>
);
const IconPlus = (props) => (
  <Svg {...props}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
const IconCopy = (props) => (
  <Svg {...props}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
);
const IconExternal = (props) => (
  <Svg {...props}>
    <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Svg>
);
const IconCheck = (props) => (
  <Svg {...props} strokeWidth={2.2}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);
const IconClock = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
const IconTrash = (props) => (
  <Svg {...props}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
  </Svg>
);
const IconWallet = (props) => (
  <Svg {...props}>
    <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M16 12h.01M3 9h18" />
  </Svg>
);
const IconReceipt = (props) => (
  <Svg {...props}>
    <path d="M4 3v18l2-1 2 1 2-1 2 1 2-1 2 1 2-1V3l-2 1-2-1-2 1-2-1-2 1-2-1z" />
    <path d="M8 8h8M8 12h6" />
  </Svg>
);
const IconSearch = (props) => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </Svg>
);
const IconLink = (props) => (
  <Svg {...props}>
    <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1L10.6 5.3" />
    <path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.4-1.4" />
  </Svg>
);
const IconTrend = (props) => (
  <Svg {...props}>
    <path d="M3 17 9 11l4 4 8-8" />
    <path d="M15 4h6v6" />
  </Svg>
);
const IconShare = (props) => (
  <Svg {...props}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
  </Svg>
);
const IconSun = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);
const IconMoon = (props) => (
  <Svg {...props}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </Svg>
);
const IconUser = (props) => (
  <Svg {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);
const IconLogout = (props) => (
  <Svg {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Svg>
);
const IconKey = (props) => (
  <Svg {...props}>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m11 12 8-8M17 4l3 3M14 7l2 2" />
  </Svg>
);
const IconStore = (props) => (
  <Svg {...props}>
    <path d="M3 9 5 4h14l2 5M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9h18" />
    <path d="M9 21v-6h6v6" />
  </Svg>
);
const IconQr = (props) => (
  <Svg {...props}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3M21 21v.01M17 21h.01M21 17h.01" />
  </Svg>
);
const IconClose = (props) => (
  <Svg {...props}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

/* ---------------------- Helpers ======================= */
function loadInvoices(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Fusionne l'historique local avec celui du backend.
// Le backend fait foi (statut paid/pending, payout, bolt11) ; les factures
// créées hors-ligne (non présentes côté backend) sont conservées.
function mergeInvoices(localList, remoteList) {
  const map = new Map();
  for (const inv of localList) map.set(inv.reference || inv.id, inv);
  for (const inv of remoteList) map.set(inv.reference || inv.id, inv);
  const merged = [...map.values()];
  merged.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return merged;
}

function formatXOF(value) {
  return Number(value || 0).toLocaleString("fr-FR");
}

// Saisie d'un numéro sénégalais : groupe les chiffres par 2-3-2-2 (ex. 77 123 45 67)
function formatPhoneInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 9);
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)];
  return parts.filter(Boolean).join(" ");
}

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

// Lien de paiement partageable (ouvre le guichet client via ?pay=<id>)
function paymentUrl(id) {
  if (typeof window === "undefined") return `https://teranga.pay/i/${id}`;
  return `${window.location.origin}/?pay=${id}`;
}

function createInvoice(amount, description, provider, phone, shop) {
  const digits = phoneDigits(phone);
  return {
    id: "inv_" + Math.random().toString(36).slice(2, 10),
    merchant: shop,
    amount: Number(amount),
    currency: "FCFA",
    description: description.trim(),
    provider: provider.id,
    liquidation: provider.name,
    phone: "+221 " + formatPhoneInput(digits),
    reference:
      "TGY-" + amount + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

// Normalise une facture renvoyée par l'API vers la forme utilisée par l'interface.
function fromApi(inv) {
  return {
    id: inv.id,
    merchant: inv.merchant,
    amount: inv.amount,
    currency: inv.currency || "FCFA",
    description: inv.description,
    provider: inv.provider,
    liquidation: inv.liquidation,
    phone: inv.merchantPhone ? "+221 " + formatPhoneInput(inv.merchantPhone) : "",
    merchantPhone: inv.merchantPhone,
    reference: inv.reference,
    status: inv.status,
    createdAt: inv.createdAt,
    paidAt: inv.paidAt,
    bolt11: inv.bolt11,
    amountSat: inv.amountSat,
    checkout_url: inv.checkout_url,
    payoutStatus: inv.payoutStatus,
  };
}

// Clé d'espace déterministe (à conserver pour retrouver l'accès)
function spaceKey(phone) {
  const digits = phoneDigits(phone);
  let hash = 0;
  for (let i = 0; i < digits.length; i += 1) {
    hash = (hash * 31 + digits.charCodeAt(i)) % 100000;
  }
  return `TGY-${digits.slice(-4).padStart(4, "0")}-${String(hash).padStart(5, "0")}`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

function formatDayLabel(date) {
  return date.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
}

/* ============================================================
   Sous-composants
   ============================================================ */
function StatCard({ icon: Icon, label, value, unit, hint, accent }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-line/10 bg-card/60 p-5 backdrop-blur transition hover:border-emerald-400/30">
      {accent && (
        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl" />
      )}
      <div className="relative flex items-center gap-2">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
            accent
              ? "border-emerald-500/30 bg-emerald-500/10 text-accent"
              : "border-line/10 bg-band/5 text-ink-muted"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
      </div>
      <p className="relative mt-3 text-2xl font-black">
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-ink-subtle">{unit}</span>}
      </p>
      <p className="relative mt-0.5 text-xs text-ink-subtle">{hint}</p>
    </div>
  );
}

function ActivityChart({ bars, max }) {
  return (
    <div className="rounded-2xl border border-line/10 bg-card/60 p-5 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line/10 bg-band/5 text-ink-muted">
            <IconTrend className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold">Activité récente</p>
            <p className="text-[11px] text-ink-subtle">Montant facturé sur 7 jours</p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex h-32 items-end gap-2">
        {bars.map((bar) => {
          const pct = max > 0 ? Math.round((bar.total / max) * 100) : 0;
          return (
            <div key={bar.date.toISOString()} className="group flex flex-1 flex-col items-center gap-2">
              <span className="text-[10px] font-semibold text-ink-faint opacity-0 transition group-hover:opacity-100">
                {bar.total > 0 ? formatXOF(bar.total) : "—"}
              </span>
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-emerald-500/30 to-emerald-400 transition-all duration-500 group-hover:from-emerald-500/50"
                  style={{ height: `${Math.max(pct, bar.total > 0 ? 8 : 2)}%` }}
                />
              </div>
              <span className="text-[10px] text-ink-faint">{formatDayLabel(bar.date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ filtered }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line/15 bg-card/40 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-line/10 bg-band/5 text-ink-subtle">
        <IconReceipt className="h-6 w-6" />
      </span>
      <p className="mt-4 text-sm font-semibold">
        {filtered ? "Aucune facture ne correspond" : "Aucune facture pour le moment"}
      </p>
      <p className="mt-1 max-w-xs text-xs text-ink-subtle">
        {filtered
          ? "Modifiez la recherche ou le filtre pour retrouver vos factures."
          : "Créez votre première facture avec le formulaire. Elle apparaîtra ici."}
      </p>
    </div>
  );
}

function ActionButton({ label, onClick, children, variant = "ghost", className = "" }) {
  const styles = {
    primary: "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
    ghost: "border border-line/10 text-ink-muted hover:bg-band/5",
    danger: "border border-line/10 text-rose-400 hover:bg-rose-500/10",
  };
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${styles[variant]} ${className}`}
    >
      {children}
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}

function InvoiceRow({ invoice, copied, shared, onOpen, onShowQr, onToggle, onRemove, onCopy, onShare }) {
  const provider = PROVIDERS.find((p) => p.id === invoice.provider);
  const paid = invoice.status === "paid";
  const date = new Date(invoice.createdAt).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="group animate-fade-in rounded-2xl border border-line/10 bg-card/60 p-4 transition hover:border-emerald-400/30 hover:bg-emerald-500/[0.04] hover:shadow-[0_18px_40px_-24px_rgba(16,185,129,0.6)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                paid
                  ? "border-emerald-500/30 bg-emerald-500/10 text-accent"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-400"
              }`}
            >
              {paid ? <IconCheck className="h-3 w-3" /> : <IconClock className="h-3 w-3" />}
              {paid ? "Payé" : "En attente"}
            </span>
            <span className="font-mono text-[11px] text-ink-faint">{invoice.reference}</span>
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-ink">{invoice.description}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-subtle">
            {provider && (
              <span className="flex h-4 w-4 items-center justify-center overflow-hidden rounded bg-white p-0.5 ring-1 ring-black/5">
                <img src={provider.logo} alt={provider.name} className="h-full w-full object-contain" />
              </span>
            )}
            <span>{provider?.name || invoice.liquidation}</span>
            {invoice.phone && (
              <>
                <span className="text-ink-faint">·</span>
                <span className="font-mono">{invoice.phone}</span>
              </>
            )}
            <span className="text-ink-faint">·</span>
            <span>{date}</span>
          </div>
        </div>

        <p className="text-right text-lg font-black">
          {formatXOF(invoice.amount)}{" "}
          <span className="text-xs font-semibold text-ink-subtle">{invoice.currency}</span>
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/5 pt-3">
        <button
          onClick={onShowQr}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
        >
          <IconQr className="h-3.5 w-3.5" />
          Voir le lien / QR
        </button>
        <ActionButton label="Aperçu client" onClick={onOpen}>
          <IconExternal className="h-3.5 w-3.5" />
        </ActionButton>
        <ActionButton
          label={paid ? "Remettre en attente" : "Marquer payé"}
          onClick={onToggle}
        >
          {paid ? <IconClock className="h-3.5 w-3.5" /> : <IconCheck className="h-3.5 w-3.5" />}
        </ActionButton>
        <ActionButton label="Partager" onClick={onShare}>
          {shared ? <IconCheck className="h-3.5 w-3.5 text-accent" /> : <IconShare className="h-3.5 w-3.5" />}
        </ActionButton>
        <ActionButton label={copied ? "Copié" : "Copier la réf."} onClick={onCopy}>
          {copied ? <IconCheck className="h-3.5 w-3.5 text-accent" /> : <IconCopy className="h-3.5 w-3.5" />}
        </ActionButton>
        <ActionButton label="Supprimer" onClick={onRemove} variant="danger" className="ml-auto">
          <IconTrash className="h-3.5 w-3.5" />
        </ActionButton>
      </div>
    </div>
  );
}

/* ============================================================
   Modale « Lien de paiement » (QR + lien à partager au client)
   ============================================================ */
function PaymentLinkModal({ invoice, copied, onClose, onCopy, onPreview }) {
  if (!invoice) return null;
  const url = paymentUrl(invoice.id);
  const provider = PROVIDERS.find((p) => p.id === invoice.provider);
  const waText = `${invoice.merchant} — ${invoice.description} : ${formatXOF(invoice.amount)} ${
    invoice.currency
  }. Payez en toute sécurité : ${url}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-base/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="animate-fade-in relative w-full max-w-md rounded-3xl border border-line/10 bg-card p-6 text-ink shadow-[0_30px_80px_-20px_rgba(16,185,129,0.55)]">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition hover:bg-band/5 hover:text-ink"
          aria-label="Fermer"
        >
          <IconClose className="h-4 w-4" />
        </button>

        <div className="text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-accent">
            <IconCheck className="h-6 w-6" />
          </span>
          <h2 className="mt-3 text-lg font-bold">Lien de paiement prêt</h2>
          <p className="mt-1 text-sm text-ink-subtle">
            {formatXOF(invoice.amount)} {invoice.currency} · {invoice.description}
          </p>
        </div>

        <div className="mt-5 flex justify-center rounded-2xl bg-white p-4">
          <QRCodeSVG value={url} size={184} />
        </div>
        <p className="mt-2 text-center text-[11px] text-ink-faint">
          Le client scanne ce code ou ouvre le lien pour payer.
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-line/10 bg-base/40 px-3 py-2.5">
          <IconLink className="h-4 w-4 shrink-0 text-ink-faint" />
          <span className="truncate font-mono text-xs text-ink-muted">{url}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={onCopy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
          >
            {copied ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
            {copied ? "Lien copié" : "Copier le lien"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line/10 py-3 text-sm font-semibold text-ink transition hover:bg-band/5"
          >
            <IconShare className="h-4 w-4" />
            Partager
          </a>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/5 pt-3 text-xs">
          <span className="text-ink-faint">
            Réception {provider?.name}
            {invoice.phone ? ` · ${invoice.phone}` : ""}
          </span>
          <button
            onClick={onPreview}
            className="inline-flex items-center gap-1.5 font-medium text-ink-subtle transition hover:text-accent"
          >
            Aperçu client
            <IconExternal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Onglet « Mon compte »
   ============================================================ */
function AccountCard({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="rounded-2xl border border-line/10 bg-card/60 p-5 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-accent">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-bold">{title}</h3>
          {subtitle && <p className="text-[11px] text-ink-subtle">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function AccountView({ session, onSessionChange, onLogout }) {
  const [shop, setShop] = useState(session?.shop || DEFAULT_SHOP);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const key = spaceKey(session?.phone || "");

  // Enregistre le nom de boutique : persiste côté backend (PUT /merchants/me) si un
  // jeton de session existe, sinon repli sur la session locale (mode démo autonome).
  const saveShop = async (event) => {
    event.preventDefault();
    const value = shop.trim() || DEFAULT_SHOP;
    setSaving(true);
    try {
      if (session?.token) await updateMerchant(session.token, { shop: value });
    } catch {
      /* backend indisponible : on conserve la valeur en session locale */
    } finally {
      setSaving(false);
    }
    onSessionChange?.({ ...session, shop: value });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      /* presse-papiers indisponible — on ignore */
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <AccountCard icon={IconStore} title="Profil boutique" subtitle="Nom affiché sur vos liens et reçus">
        <form onSubmit={saveShop} className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-line/10">
            <img src="/logos/teranga-pay.jpg" alt="" className="h-full w-full object-cover" />
          </span>
          <input
            type="text"
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            className="w-full rounded-xl border border-line/10 bg-base/40 px-3 py-2.5 text-sm outline-none focus:border-emerald-400/50"
          />
          <button
            type="submit"
            disabled={saving}
            className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saved ? "Enregistré" : saving ? "…" : "Enregistrer"}
          </button>
        </form>
      </AccountCard>

      <AccountCard
        icon={IconWallet}
        title="Réception Mobile Money"
        subtitle="Numéro où vos fonds sont liquidés"
      >
        <div className="rounded-xl border border-line/10 bg-base/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-faint">Numéro principal</p>
          <p className="mt-1 font-mono text-sm text-ink">{session?.phone || "—"}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PROVIDERS.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-2 rounded-lg border border-line/10 bg-band/5 px-3 py-1.5 text-xs text-ink-muted"
            >
              <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded bg-white p-0.5 ring-1 ring-black/5">
                <img src={p.logo} alt={p.name} className="h-full w-full object-contain" />
              </span>
              {p.name}
            </span>
          ))}
        </div>
      </AccountCard>

      <AccountCard
        icon={IconKey}
        title="Clé d'espace"
        subtitle="Conservez-la pour retrouver votre accès"
      >
        <div className="flex items-center gap-2 rounded-xl border border-line/10 bg-base/40 px-4 py-3">
          <span className="font-mono text-sm text-ink">{key}</span>
          <button
            onClick={copyKey}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-line/10 px-2.5 py-1.5 text-xs text-ink-muted transition hover:bg-band/5"
          >
            {copiedKey ? <IconCheck className="h-3.5 w-3.5 text-accent" /> : <IconCopy className="h-3.5 w-3.5" />}
            {copiedKey ? "Copiée" : "Copier"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          Sans mot de passe : votre numéro + cette clé identifient votre espace.
        </p>
      </AccountCard>

      <AccountCard icon={IconUser} title="Session" subtitle="Connexion sans mot de passe">
        <div className="rounded-xl border border-line/10 bg-base/40 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-faint">Connecté depuis le</p>
          <p className="mt-1 text-sm text-ink">
            {session?.since
              ? new Date(session.since).toLocaleString("fr-FR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </p>
        </div>
        <button
          onClick={onLogout}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line/10 px-4 py-2.5 text-sm font-semibold text-rose-400 transition hover:bg-rose-500/10"
        >
          <IconLogout className="h-4 w-4" />
          Se déconnecter
        </button>
      </AccountCard>
    </div>
  );
}

/* ============================================================
   Page
   ============================================================ */
export default function MerchantDashboard({
  session,
  onSessionChange,
  onLogout,
  onViewChange,
  onOpenCheckout,
}) {
  const shop = session?.shop || DEFAULT_SHOP;
  const storageKey = `${STORAGE_PREFIX}:${session?.phone || "demo"}`;
  const [tab, setTab] = useState("dashboard");
  const [invoices, setInvoices] = useState(() => loadInvoices(storageKey));
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState(PROVIDERS[0].id);
  // Prérempli avec le numéro du compte connecté (le backend impose de toute
  // façon le numéro de la session : une facture appartient toujours au compte).
  const [phone, setPhone] = useState(() => phoneDigits(session?.phone || ""));
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [sharedId, setSharedId] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [modalInvoice, setModalInvoice] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState(() =>
    typeof document !== "undefined" ? document.documentElement.dataset.theme || "dark" : "dark"
  );

  // Application + mémorisation du thème
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("teranga-theme", theme);
    } catch {
      /* stockage indisponible */
    }
  }, [theme]);

  // Persistance de l'historique local (scopé par numéro de marchand)
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(invoices));
    } catch {
      /* stockage indisponible — on ignore */
    }
  }, [invoices, storageKey]);

  // [ÉTAPE A] Synchronise l'historique depuis le backend au montage.
  // Repli silencieux sur le local si le backend est indisponible.
  useEffect(() => {
    const digits = phoneDigits(session?.phone || "");
    if (!digits) return; // mode démo sans numéro : pas d'appel
    let cancelled = false;
    listPaymentLinks({ merchantPhone: digits }, session?.token)
      .then((res) => {
        if (cancelled) return;
        const remote = Array.isArray(res?.invoices) ? res.invoices.map(fromApi) : [];
        if (!remote.length) return;
        setInvoices((prev) => mergeInvoices(prev, remote));
      })
      .catch(() => {
        /* backend indisponible ou non authentifié : on garde l'historique local */
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey, session?.phone, session?.token]);

  const stats = useMemo(() => {
    const paid = invoices.filter((i) => i.status === "paid");
    const pending = invoices.filter((i) => i.status === "pending");
    const sum = (list) => list.reduce((s, i) => s + Number(i.amount || 0), 0);
    const rate = invoices.length ? Math.round((paid.length / invoices.length) * 100) : 0;
    return {
      count: invoices.length,
      paidTotal: sum(paid),
      paidCount: paid.length,
      pendingTotal: sum(pending),
      pendingCount: pending.length,
      rate,
    };
  }, [invoices]);

  // Activité sur les 7 derniers jours (montant facturé par jour)
  const activity = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    const bars = days.map((d) => {
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const total = invoices
        .filter((inv) => {
          const t = new Date(inv.createdAt);
          return t >= d && t < next;
        })
        .reduce((s, i) => s + Number(i.amount || 0), 0);
      return { date: d, total };
    });
    const max = Math.max(1, ...bars.map((b) => b.total));
    return { bars, max };
  }, [invoices]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((inv) => {
      const okStatus =
        filter === "all" || (filter === "paid" ? inv.status === "paid" : inv.status === "pending");
      const okQuery =
        !q ||
        inv.description.toLowerCase().includes(q) ||
        inv.reference.toLowerCase().includes(q);
      return okStatus && okQuery;
    });
  }, [invoices, filter, query]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("Saisissez un montant valide en XOF.");
      return;
    }
    if (!description.trim()) {
      setError("Ajoutez une description à la facture.");
      return;
    }
    if (phoneDigits(phone).length !== 9) {
      setError("Saisissez un numéro Mobile Money valide (9 chiffres).");
      return;
    }

    const providerObj = PROVIDERS.find((p) => p.id === provider) || PROVIDERS[0];
    setError("");
    setCreating(true);

    let invoice;
    try {
      const remote = await createPaymentLink(
        {
          merchantPhone: phoneDigits(phone),
          provider: providerObj.id,
          amountXOF: value,
          description: description.trim(),
          merchant: shop,
        },
        session?.token
      );
      invoice = fromApi(remote);
    } catch {
      // Backend indisponible (ou non authentifié) -> repli local (mode démo autonome)
      invoice = createInvoice(value, description, providerObj, phone, shop);
      showToast("Backend indisponible — facture enregistrée localement.");
    } finally {
      setCreating(false);
    }

    setInvoices((prev) => [invoice, ...prev]);
    setAmount("");
    setDescription("");
    setPhone("");
    setModalInvoice(invoice);
    if (invoice.status && invoice.reference) showToast(`Facture ${invoice.reference} créée.`);
  };

  const toggleStatus = (id) =>
    setInvoices((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: i.status === "paid" ? "pending" : "paid" } : i))
    );

  const removeInvoice = (id) => {
    const target = invoices.find((i) => i.id === id);
    if (typeof window !== "undefined" && target) {
      const ok = window.confirm(`Supprimer la facture ${target.reference} ?`);
      if (!ok) return;
    }
    setInvoices((prev) => prev.filter((i) => i.id !== id));
  };

  const copyReference = async (invoice) => {
    try {
      await navigator.clipboard.writeText(invoice.reference);
      setCopiedId(invoice.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* presse-papiers indisponible — on ignore */
    }
  };

  const shareInvoice = (invoice) => {
    const text = `${invoice.merchant} — ${invoice.description} : ${formatXOF(invoice.amount)} ${
      invoice.currency
    } (réf. ${invoice.reference}). Payez en toute sécurité : ${paymentUrl(invoice.id)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    setSharedId(invoice.id);
    setTimeout(() => setSharedId(null), 2000);
  };

  const copyLink = async (invoice) => {
    try {
      await navigator.clipboard.writeText(paymentUrl(invoice.id));
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      /* presse-papiers indisponible — on ignore */
    }
  };

  const FILTERS = [
    { id: "all", label: "Toutes", count: stats.count },
    { id: "pending", label: "En attente", count: stats.pendingCount },
    { id: "paid", label: "Payées", count: stats.paidCount },
  ];

  return (
    <div className="relative isolate min-h-screen bg-base text-ink">
      {/* Image de fond globale (fixe, discrète) — cohérence avec la vitrine */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.05]"
          style={{ backgroundImage: `url('${PAGE_BG}')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-base/70 via-base/85 to-base" />
      </div>

      {/* ===================== En-tête ===================== */}
      <header className="sticky top-0 z-40 border-b border-line/10 bg-base/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <img
              src="/logos/teranga-pay.jpg"
              alt="Teranga Pay"
              className="h-10 w-auto rounded-lg object-contain ring-1 ring-line/10"
            />
            <nav className="hidden items-center gap-1 rounded-xl border border-line/10 bg-band/5 p-1 sm:flex">
              {[
                { id: "dashboard", label: "Tableau de bord" },
                { id: "account", label: "Mon compte" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                    tab === t.id ? "bg-emerald-500 text-slate-950" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border border-line/10 px-3 py-1.5 md:flex">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-accent">
                <IconUser className="h-3.5 w-3.5" />
              </span>
              <span className="leading-tight">
                <span className="block max-w-[10rem] truncate text-xs font-semibold text-ink">
                  {shop}
                </span>
                <span className="block font-mono text-[10px] text-ink-faint">
                  {session?.phone || "—"}
                </span>
              </span>
            </div>
            <button
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-line/10 text-ink transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-accent"
              aria-label={theme === "dark" ? "Passer au thème clair" : "Passer au thème sombre"}
              title={theme === "dark" ? "Thème clair" : "Thème sombre"}
            >
              {theme === "dark" ? <IconSun className="h-5 w-5" /> : <IconMoon className="h-5 w-5" />}
            </button>
            <button
              onClick={() => onViewChange?.("landing")}
              className="inline-flex items-center gap-2 rounded-lg border border-line/10 px-3.5 py-2 text-sm font-medium text-ink transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-accent"
            >
              <IconBack className="h-4 w-4" />
              <span className="hidden lg:inline">Voir la vitrine</span>
            </button>
          </div>
        </div>

        {/* Onglets (mobile) */}
        <div className="border-t border-line/10 px-6 py-2 sm:hidden">
          <div className="flex items-center gap-1 rounded-xl border border-line/10 bg-band/5 p-1">
            {[
              { id: "dashboard", label: "Tableau de bord" },
              { id: "account", label: "Mon compte" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  tab === t.id ? "bg-emerald-500 text-slate-950" : "text-ink-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {tab === "account" ? (
          <div>
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                Espace marchand
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">Mon compte</h1>
              <p className="mt-2 text-sm text-ink-subtle">
                Gérez votre boutique et votre accès, sans mot de passe.
              </p>
            </div>
            <AccountView session={session} onSessionChange={onSessionChange} onLogout={onLogout} />
          </div>
        ) : (
          <>
        {/* ===================== En-tête de page ===================== */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">
              Espace marchand
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">
              {greeting()}, <span className="text-accent">{shop.split(" ")[0]}</span>
            </h1>
            <p className="mt-2 text-sm text-ink-subtle">
              Créez un lien de paiement et suivez vos encaissements en FCFA.
            </p>
          </div>
          <a
            href="#nouvelle-facture"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
          >
            <IconPlus className="h-4 w-4" />
            Nouvelle facture
          </a>
        </div>

        {/* ===================== Statistiques ===================== */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={IconWallet}
            label="Total encaissé"
            value={formatXOF(stats.paidTotal)}
            unit="FCFA"
            hint={`${stats.paidCount} facture(s) payée(s)`}
            accent
          />
          <StatCard
            icon={IconClock}
            label="En attente"
            value={formatXOF(stats.pendingTotal)}
            unit="FCFA"
            hint={`${stats.pendingCount} facture(s) en attente`}
          />
          <StatCard
            icon={IconReceipt}
            label="Factures émises"
            value={String(stats.count)}
            hint="Historique local"
          />
          <StatCard
            icon={IconTrend}
            label="Taux d'encaissement"
            value={`${stats.rate}`}
            unit="%"
            hint="Factures réglées"
            accent={stats.rate >= 50}
          />
        </div>

        {/* ===================== Activité ===================== */}
        <div className="mt-4">
          <ActivityChart bars={activity.bars} max={activity.max} />
        </div>

        {/* ===================== Formulaire + Historique ===================== */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* Formulaire */}
          <section id="nouvelle-facture" className="lg:col-span-1">
            <div className="rounded-2xl border border-line/10 bg-card/70 p-6 backdrop-blur lg:sticky lg:top-24">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-accent">
                  <IconPlus className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-base font-bold">Nouvelle facture</h2>
                  <p className="text-[11px] text-ink-subtle">Générez un lien à partager.</p>
                </div>
              </div>

              <form onSubmit={handleCreate} className="mt-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    Montant (XOF)
                  </label>
                  <div className="mt-1.5 flex items-center rounded-xl border border-line/10 bg-base/40 focus-within:border-emerald-400/50">
                    <input
                      type="number"
                      min="100"
                      step="50"
                      inputMode="numeric"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="25000"
                      className="w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-ink-faint"
                    />
                    <span className="px-3 text-xs font-semibold text-ink-subtle">FCFA</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {QUICK_AMOUNTS.map((value) => (
                      <button
                        type="button"
                        key={value}
                        onClick={() => setAmount(String(value))}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                          Number(amount) === value
                            ? "border-emerald-400/60 bg-emerald-500/10 text-accent"
                            : "border-line/10 text-ink-muted hover:bg-band/5"
                        }`}
                      >
                        {formatXOF(value)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    Description
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Robe brodée taille M"
                    className="mt-1.5 w-full rounded-xl border border-line/10 bg-base/40 px-3 py-2.5 text-sm outline-none placeholder:text-ink-faint focus:border-emerald-400/50"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    Réception Mobile Money
                  </label>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {PROVIDERS.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setProvider(p.id)}
                        className={`flex flex-col items-center gap-2 rounded-xl border p-2.5 transition ${
                          provider === p.id
                            ? "border-emerald-400/60 bg-emerald-500/10"
                            : "border-line/10 bg-base/40 hover:bg-band/5"
                        }`}
                      >
                        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-white p-1 ring-1 ring-black/5">
                          <img src={p.logo} alt={p.name} className="h-full w-full object-contain" />
                        </span>
                        <span className="text-center text-[10px] font-medium leading-tight text-ink-muted">
                          {p.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    Numéro Mobile Money
                  </label>
                  <div className="mt-1.5 flex items-center rounded-xl border border-line/10 bg-base/40 focus-within:border-emerald-400/50">
                    <span className="flex items-center gap-1.5 border-r border-line/10 px-3 py-2.5 text-sm text-ink-subtle">
                      <img
                        src={PROVIDERS.find((p) => p.id === provider)?.logo}
                        alt=""
                        className="h-4 w-4 rounded object-contain"
                      />
                      +221
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                      placeholder="77 123 45 67"
                      className="w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-ink-faint"
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-ink-faint">
                    Numéro de réception {PROVIDERS.find((p) => p.id === provider)?.name}.
                  </p>
                </div>

                {error && (
                  <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={creating}
                  className="shine relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <IconLink className="h-4 w-4" />
                  {creating ? "Création du lien…" : "Créer le lien de paiement"}
                </button>

                <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-faint">
                  <IconBolt className="h-3.5 w-3.5 text-accent" />
                  Liquidation en FCFA sur Mobile Money
                </p>
              </form>
            </div>
          </section>

          {/* Historique */}
          <section className="lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold">Historique des factures</h2>
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher…"
                  className="w-44 rounded-lg border border-line/10 bg-base/40 py-2 pl-9 pr-3 text-xs outline-none placeholder:text-ink-faint focus:border-emerald-400/50 sm:w-56"
                />
              </div>
            </div>

            {/* Filtres */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    filter === f.id
                      ? "border-emerald-400/50 bg-emerald-500/10 text-accent"
                      : "border-line/10 text-ink-muted hover:bg-band/5"
                  }`}
                >
                  {f.label}
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-bold ${
                      filter === f.id ? "bg-emerald-500/20 text-accent" : "bg-band/10 text-ink-faint"
                    }`}
                  >
                    {f.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              {visible.length === 0 ? (
                <EmptyState filtered={invoices.length > 0} />
              ) : (
                visible.map((invoice) => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
                    copied={copiedId === invoice.id}
                    shared={sharedId === invoice.id}
                    onOpen={() => onOpenCheckout?.(invoice.id)}
                    onShowQr={() => setModalInvoice(invoice)}
                    onToggle={() => toggleStatus(invoice.id)}
                    onRemove={() => removeInvoice(invoice.id)}
                    onCopy={() => copyReference(invoice)}
                    onShare={() => shareInvoice(invoice)}
                  />
                ))
              )}
            </div>
          </section>
        </div>
          </>
        )}
      </main>

      {/* Modale lien de paiement (QR) */}
      <PaymentLinkModal
        invoice={modalInvoice}
        copied={copiedLink}
        onClose={() => {
          setModalInvoice(null);
          setCopiedLink(false);
        }}
        onCopy={() => copyLink(modalInvoice)}
        onPreview={() => {
          const id = modalInvoice?.id;
          setModalInvoice(null);
          onOpenCheckout?.(id);
        }}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-card/95 px-4 py-2.5 text-sm text-ink shadow-[0_20px_50px_-20px_rgba(16,185,129,0.7)] backdrop-blur">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-accent">
              <IconCheck className="h-3.5 w-3.5" />
            </span>
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
