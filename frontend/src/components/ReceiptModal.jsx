// [FICHIER] : frontend/src/components/ReceiptModal.jsx
// [RÔLE] : modale de reçu de paiement (confirmation) — flux client.
// [UI] : Tailwind CSS (overlay + carte centrée). Tokens de thème (clair/sombre) + accent émeraude.
// [FLUX] : ouverte par CheckoutPage.jsx quand le paiement est confirmé.

function IconCheck({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Row({ label, value, strong, mono }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/10 pb-2.5">
      <dt className="text-ink-subtle">{label}</dt>
      <dd
        className={`text-right ${strong ? "font-bold text-ink" : "text-ink-muted"} ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export default function ReceiptModal({ open, invoice, onClose }) {
  if (!open) return null;

  const {
    amount = 0,
    currency = "FCFA",
    reference = "—",
    method = "Bitcoin Lightning",
    liquidation = "Wave",
    date = "",
    merchant = "",
    description = "",
  } = invoice || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-base/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Carte */}
      <div
        role="dialog"
        aria-modal="true"
        className="animate-fade-in relative w-full max-w-sm rounded-2xl border border-line/10 bg-card p-6 text-ink shadow-[0_30px_80px_-20px_rgba(16,185,129,0.55)]"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-accent">
          <IconCheck className="h-7 w-7" />
        </div>

        <h2 className="mt-4 text-center text-lg font-bold">Paiement confirmé</h2>
        <p className="mt-1 text-center text-sm text-ink-subtle">
          Le paiement a bien été reçu et sera liquidé en Mobile Money.
        </p>

        <div className="mt-5 rounded-xl border border-line/10 bg-band/5 p-4 text-center">
          <p className="text-3xl font-black text-ink">
            {Number(amount).toLocaleString("fr-FR")}{" "}
            <span className="text-base font-semibold text-ink-subtle">{currency}</span>
          </p>
          {description && <p className="mt-1 text-xs text-ink-subtle">{description}</p>}
          {merchant && <p className="mt-1 text-xs text-ink-faint">{merchant}</p>}
        </div>

        <dl className="mt-5 space-y-2.5 text-sm">
          <Row label="Référence" value={reference} mono />
          <Row label="Mode de paiement" value={method} />
          <Row label="Liquidation" value={liquidation} />
          <Row label="Date" value={date} />
        </dl>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
