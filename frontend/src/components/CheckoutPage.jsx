// [FICHIER] : frontend/src/components/CheckoutPage.jsx
// [RÔLE] : guichet de paiement public (client diaspora, aucune inscription requise).
// [UI] : Tailwind CSS — tokens de thème (clair/sombre) + accent émeraude. QR Lightning via qrcode.react.
// [FLUX] : chargement facture (GET /api/invoices/:id) -> QR BOLT11 -> paiement Lightning
//          -> polling du statut (GET /api/invoices/:id/status) -> ReceiptModal.jsx quand payé.

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import ReceiptModal from "./ReceiptModal";
import { getPaymentLink, getPaymentStatus } from "../services/api";

const EXPIRY_SECONDS = 15 * 60;

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

/* ---------------------- Composant ======================= */
export default function CheckoutPage({ invoiceId, onViewChange }) {
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState("pending"); // pending | paid | expired
  const [showReceipt, setShowReceipt] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(EXPIRY_SECONDS);
  const [copied, setCopied] = useState(false);
  const [paidAt, setPaidAt] = useState("");

  // Chargement de la facture depuis le backend.
  useEffect(() => {
    let alive = true;
    if (!invoiceId) {
      setLoading(false);
      setLoadError("Aucune facture indiquée dans ce lien.");
      return () => {
        alive = false;
      };
    }

    setLoading(true);
    setLoadError("");
    (async () => {
      try {
        const data = await getPaymentLink(invoiceId);
        if (!alive) return;
        if (!data || !data.id) {
          setLoadError("Facture introuvable. Demandez un nouveau lien au marchand.");
          return;
        }
        setInvoice(data);
        if (data.status === "paid") {
          setStatus("paid");
          if (data.paidAt) setPaidAt(new Date(data.paidAt).toLocaleString("fr-FR"));
        }
      } catch (err) {
        if (!alive) return;
        setLoadError(
          err?.response?.status === 404
            ? "Facture introuvable. Demandez un nouveau lien au marchand."
            : "Impossible de charger la facture. Vérifiez votre connexion et réessayez."
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [invoiceId]);

  // Cale le décompte sur l'expiration réelle de la facture (renvoyée par le backend).
  useEffect(() => {
    if (!invoice?.expiresAt || status !== "pending") return;
    const ms = new Date(invoice.expiresAt).getTime() - Date.now();
    if (Number.isFinite(ms)) setSecondsLeft(Math.max(0, Math.round(ms / 1000)));
  }, [invoice, status]);

  // Décompte d'expiration
  useEffect(() => {
    if (status !== "pending" || !invoice) return undefined;
    const t = setInterval(() => setSecondsLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [status, invoice]);

  useEffect(() => {
    if (secondsLeft === 0 && status === "pending" && invoice) setStatus("expired");
  }, [secondsLeft, status, invoice]);

  // Polling du statut de paiement (le backend confirme via webhook Bitnob / polling Lightning).
  useEffect(() => {
    if (!invoice?.id || status !== "pending") return undefined;

    const timer = setInterval(async () => {
      try {
        const data = await getPaymentStatus(invoice.id);
        if (data.status === "paid" || data.status === "confirmed") confirmPayment();
        else if (data.status === "expired") setStatus("expired");
      } catch {
        /* backend momentanément injoignable : on continue d'attendre */
      }
    }, 4000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, invoice?.id]);

  const confirmPayment = () => {
    setStatus("paid");
    setPaidAt(new Date().toLocaleString("fr-FR"));
    setShowReceipt(true);
  };

  const copyBolt11 = async () => {
    if (!invoice?.bolt11) return;
    try {
      await navigator.clipboard.writeText(invoice.bolt11);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const receiptData = invoice ? { ...invoice, date: paidAt } : null;

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
        {loading || !invoice ? (
          <div className="mx-auto max-w-md rounded-2xl border border-line/10 bg-card/50 p-8 text-center">
            {loadError ? (
              <>
                <p className="font-bold">Facture indisponible</p>
                <p className="mt-2 text-sm text-ink-subtle">{loadError}</p>
                <button
                  onClick={() => onViewChange?.("landing")}
                  className="mt-5 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
                >
                  Retour à l'accueil
                </button>
              </>
            ) : (
              <p className="text-sm text-ink-subtle">Chargement de la facture…</p>
            )}
          </div>
        ) : (
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
                    <p className="font-mono text-xs text-ink-muted">{invoice.reference || invoice.id}</p>
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

                  {invoice.bolt11 ? (
                    <>
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
                    </>
                  ) : (
                    <p className="mt-4 rounded-lg border border-dashed border-line/15 px-3 py-4 text-center text-xs text-ink-subtle">
                      Facture Lightning indisponible — demandez un nouveau lien au marchand.
                    </p>
                  )}
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
        )}
      </main>

      <ReceiptModal
        open={showReceipt && Boolean(receiptData)}
        invoice={receiptData}
        onClose={() => setShowReceipt(false)}
      />
    </div>
  );
}
