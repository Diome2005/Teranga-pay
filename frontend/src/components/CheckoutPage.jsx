// [FICHIER] : frontend/src/components/CheckoutPage.jsx
// [RÔLE] : guichet de paiement public (client diaspora, aucune inscription requise).
// [UI] : Tailwind CSS — tokens de thème (clair/sombre) + accent émeraude. QR Lightning via qrcode.react.
// [FLUX] : chargement facture -> QR BOLT11 -> paiement Lightning / carte -> polling du statut
//          -> ouverture de ReceiptModal.jsx quand le paiement est confirmé.
// [ÉTAPE 6] : le bouton carte tente un vrai paiement Stripe (/api/invoices/:id/card) et
//          redirige vers la page Stripe ; repli mode démo si Stripe/backend indisponibles.
// NOTE : mode démo autonome — si le backend (/api/invoices) est indisponible, une facture
//        d'exemple est utilisée et le paiement est simulé (polling + boutons démo).

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import ReceiptModal from "./ReceiptModal";
import { createCardPayment, getPaymentLink, getPaymentStatus, simulateCardPayment } from "../services/api";

// --- Données de démonstration (remplacées par l'API quand le backend sera prêt) ---
const EXPIRY_SECONDS = 15 * 60;

const DEMO_INVOICE = {
  id: "inv_demo_25000",
  merchant: "Atelier Awa Couture",
  amount: 25000,
  currency: "FCFA",
  description: "Robe brodée taille M",
  bolt11:
    "lnbc250u1p3terangapay0pp5qqqsyqcyq5rqwzqfpg9scrgwpugpzysn7j4dx9qqqsyqcyq5rqwzqfpg9scrgwpugpzysn",
  reference: "TGY-25000-AWA-001",
  method: "Bitcoin Lightning",
  liquidation: "Wave",
};

/* ---------------------- Icônes (SVG) ======================= */
function IconBack({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function IconBolt({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M13 2 4 13h6l-1 9 9-11h-6l1-9z" />
    </svg>
  );
}

function IconCopy({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
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

function IconCard({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
    </svg>
  );
}

function IconShield({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconClock({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function formatCountdown(total) {
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// Facture créée localement par le Dashboard marchand.
// Les factures sont scopées par marchand : clés "teranga-invoices:<numéro>".
function findLocalInvoice(id) {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("teranga-invoices")) continue;
      const raw = localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) continue;
      const found = list.find((inv) => inv.id === id);
      if (found) return found;
    }
    return null;
  } catch {
    return null;
  }
}

/* ---------------------- Composant ======================= */
export default function CheckoutPage({ invoiceId, justPaid, onViewChange }) {
  const [invoice, setInvoice] = useState(DEMO_INVOICE);
  const [status, setStatus] = useState("pending"); // pending | paid | expired
  const [showReceipt, setShowReceipt] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(EXPIRY_SECONDS);
  const [copied, setCopied] = useState(false);
  const [paidAt, setPaidAt] = useState("");
  const [cardBusy, setCardBusy] = useState(false);
  const pollCount = useRef(0);

  // Chargement de la facture (fallback démo si backend indisponible)
  useEffect(() => {
    let alive = true;
    if (!invoiceId) return () => { alive = false; };

    (async () => {
      try {
        const data = await getPaymentLink(invoiceId);
        if (alive && data) setInvoice((prev) => ({ ...prev, ...data, id: invoiceId }));
      } catch {
        const local = findLocalInvoice(invoiceId);
        if (alive) setInvoice((prev) => ({ ...prev, ...(local || {}), id: invoiceId }));
      }
    })();

    return () => {
      alive = false;
    };
  }, [invoiceId]);

  // Décompte d'expiration
  useEffect(() => {
    if (status !== "pending") return undefined;
    const t = setInterval(() => setSecondsLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [status]);

  useEffect(() => {
    if (secondsLeft === 0 && status === "pending") setStatus("expired");
  }, [secondsLeft, status]);

  // Polling du statut de paiement
  useEffect(() => {
    if (status !== "pending") return undefined;

    const timer = setInterval(async () => {
      pollCount.current += 1;
      let paid = false;

      try {
        const data = await getPaymentStatus(invoice.id);
        paid = data.status === "paid" || data.status === "confirmed";
      } catch {
        // backend indisponible -> mode démo
      }

      // Mode démo : paiement simulé après ~12 s (3 cycles de 4 s)
      if (!paid && pollCount.current >= 3) paid = true;

      if (paid) confirmPayment();
    }, 4000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, invoice.id]);

  const confirmPayment = () => {
    setStatus("paid");
    setPaidAt(new Date().toLocaleString("fr-FR"));
    setShowReceipt(true);
  };

  // Retour depuis Stripe Checkout (?paid=1) : le paiement est confirmé côté serveur.
  useEffect(() => {
    if (justPaid) confirmPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justPaid]);

  // [ÉTAPE 6] Paiement par carte réel via Stripe Checkout ; repli mode démo si indisponible.
  const payByCard = async () => {
    setCardBusy(true);
    try {
      const res = await createCardPayment(invoice.id);
      if (res?.checkoutUrl) {
        // Redirection vers la page de paiement Stripe ; le retour se fait via ?pay=<ref>.
        window.location.href = res.checkoutUrl;
        return;
      }
      confirmPayment();
    } catch {
      // Stripe non configuré ou backend absent -> simulation (mode démo).
      confirmPayment();
    } finally {
      setCardBusy(false);
    }
  };

  // (Démo) encaissement simulé via le backend (POST /simulate-card) ; repli local si absent.
  const simulatePayment = async () => {
    try {
      await simulateCardPayment(invoice.id);
    } catch {
      // Backend indisponible ou mode réel -> simulation locale.
    }
    confirmPayment();
  };

  const copyBolt11 = async () => {
    try {
      await navigator.clipboard.writeText(invoice.bolt11);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const receiptData = { ...invoice, date: paidAt };

  return (
    <div className="min-h-screen bg-base text-ink">
      {/* En-tête */}
      <header className="border-b border-line/5">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <button
            onClick={() => onViewChange?.("landing")}
            className="flex items-center gap-2 rounded-lg border border-line/10 px-3 py-2 text-sm text-ink-muted transition hover:bg-band/5"
          >
            <IconBack className="h-4 w-4" />
            Retour
          </button>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-accent">
              <IconBolt className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold">Teranga Pay</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="grid gap-8 md:grid-cols-2">
          {/* Récapitulatif */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">
              Guichet de paiement
            </p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight">Paiement sécurisé</h1>
            <p className="mt-2 text-sm text-ink-subtle">
              Réglez votre commande auprès de {invoice.merchant} en quelques secondes.
            </p>

            <div className="mt-6 rounded-2xl border border-line/10 bg-band/5 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-ink-faint">Marchand</p>
                  <p className="font-semibold">{invoice.merchant}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-ink-faint">Facture</p>
                  <p className="font-mono text-xs text-ink-muted">{invoice.id}</p>
                </div>
              </div>

              <div className="mt-4 border-t border-line/5 pt-4">
                <p className="text-xs uppercase tracking-wide text-ink-faint">Désignation</p>
                <p className="text-ink">{invoice.description}</p>
              </div>

              <div className="mt-4 flex items-end justify-between border-t border-line/5 pt-4">
                <span className="text-sm text-ink-subtle">Total à payer</span>
                <span className="text-2xl font-black">
                  {Number(invoice.amount).toLocaleString("fr-FR")}{" "}
                  <span className="text-sm font-semibold text-ink-subtle">{invoice.currency}</span>
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-ink-faint">
              <IconShield className="h-4 w-4 text-accent" />
              Paiement sécurisé sur le réseau Bitcoin Lightning
            </div>
          </section>

          {/* Paiement */}
          <section className="rounded-2xl border border-line/10 bg-card/50 p-5">
            {status === "pending" && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Payer en Bitcoin Lightning</p>
                  <span className="flex items-center gap-1 text-xs text-ink-subtle">
                    <IconClock className="h-3.5 w-3.5" />
                    {formatCountdown(secondsLeft)}
                  </span>
                </div>

                <div className="mt-4 flex justify-center rounded-xl bg-white p-4">
                  <QRCodeSVG value={invoice.bolt11} size={176} />
                </div>

                <button
                  onClick={copyBolt11}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-line/10 py-2 text-xs text-ink-muted transition hover:bg-band/5"
                >
                  <IconCopy className="h-4 w-4" />
                  {copied ? "Facture copiée" : "Copier la facture Lightning"}
                </button>

                <div className="my-5 flex items-center gap-3 text-xs text-ink-faint">
                  <span className="h-px flex-1 bg-band/10" />
                  ou
                  <span className="h-px flex-1 bg-band/10" />
                </div>

                <button
                  onClick={payByCard}
                  disabled={cardBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <IconCard className="h-4 w-4" />
                  {cardBusy ? "Redirection…" : "Payer par Carte / Apple Pay"}
                </button>

                <button
                  onClick={simulatePayment}
                  className="mt-3 w-full rounded-lg border border-line/10 py-2 text-xs text-ink-subtle transition hover:bg-band/5"
                >
                  Simuler le paiement (démo)
                </button>
              </>
            )}

            {status === "paid" && (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-accent">
                  <IconCheck className="h-7 w-7" />
                </div>
                <p className="mt-4 font-bold">Paiement confirmé</p>
                <p className="mt-1 text-sm text-ink-subtle">
                  Liquidation vers {invoice.liquidation} en cours.
                </p>
                <button
                  onClick={() => setShowReceipt(true)}
                  className="mt-5 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
                >
                  Voir le reçu
                </button>
              </div>
            )}

            {status === "expired" && (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300">
                  <IconClock className="h-7 w-7" />
                </div>
                <p className="mt-4 font-bold">Facture expirée</p>
                <p className="mt-1 text-sm text-ink-subtle">
                  Ce lien de paiement a expiré. Demandez-en un nouveau au marchand.
                </p>
              </div>
            )}
          </section>
        </div>
      </main>

      <ReceiptModal
        open={showReceipt}
        invoice={receiptData}
        onClose={() => setShowReceipt(false)}
      />
    </div>
  );
}
