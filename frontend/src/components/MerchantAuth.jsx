// [FICHIER] : frontend/src/components/MerchantAuth.jsx
// [RÔLE] : connexion "sans friction" du marchand (passwordless).
// [FLUX] : saisie du numéro Mobile Money -> code OTP -> ouverture de l'espace marchand.
//          Aucun compte à créer : le numéro + le code suffisent.
// [UI] : Tailwind CSS — tokens de thème (clair/sombre) + accent émeraude. Sans emoji.
// NOTE : backend non branché — le code OTP est simulé et affiché à l'écran (démo).

import { useEffect, useState } from "react";

const PAGE_BG = "/images/dakar-city.jpg";
const OTP_COOLDOWN = 30;

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
const IconShield = (props) => (
  <Svg {...props}>
    <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);
const IconArrow = (props) => (
  <Svg {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

/* ---------------------- Helpers ======================= */
function formatPhoneInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 9);
  const parts = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)];
  return parts.filter(Boolean).join(" ");
}

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export default function MerchantAuth({ onAuthenticated, onBack }) {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentCode, setSentCode] = useState("");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const digits = phoneDigits(phone);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const sendCode = (event) => {
    event.preventDefault();
    if (digits.length !== 9) {
      setError("Saisissez un numéro Mobile Money valide (9 chiffres).");
      return;
    }
    setSentCode(String(Math.floor(100000 + Math.random() * 900000)));
    setCode("");
    setError("");
    setStep("otp");
    setCooldown(OTP_COOLDOWN);
  };

  const resend = () => {
    if (cooldown > 0) return;
    setSentCode(String(Math.floor(100000 + Math.random() * 900000)));
    setCode("");
    setCooldown(OTP_COOLDOWN);
  };

  const verify = (event) => {
    event.preventDefault();
    if (code !== sentCode) {
      setError("Code incorrect. Vérifiez le code reçu.");
      return;
    }
    onAuthenticated?.({
      phone: `+221 ${formatPhoneInput(digits)}`,
      shop: "Atelier Awa Couture",
      since: new Date().toISOString(),
    });
  };

  return (
    <div className="relative isolate flex min-h-screen flex-col bg-base text-ink">
      {/* Fond discret (cohérence avec la vitrine) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.05]"
          style={{ backgroundImage: `url('${PAGE_BG}')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-base/70 via-base/85 to-base" />
      </div>

      {/* En-tête */}
      <header className="border-b border-line/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <img
            src="/logos/teranga-pay.jpg"
            alt="Teranga Pay"
            className="h-10 w-auto rounded-lg object-contain ring-1 ring-line/10"
          />
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-lg border border-line/10 px-3.5 py-2 text-sm font-medium text-ink transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-accent"
          >
            <IconBack className="h-4 w-4" />
            <span className="hidden sm:inline">Retour à l'accueil</span>
          </button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-3xl border border-line/10 bg-card/70 p-7 shadow-[0_30px_80px_-30px_rgba(16,185,129,0.5)] backdrop-blur-xl">
            <div className="flex items-center gap-2 text-accent">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                <IconBolt className="h-4 w-4" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider">Espace marchand</span>
            </div>

            {step === "phone" ? (
              <>
                <h1 className="mt-5 text-2xl font-bold tracking-tight">Connectez-vous</h1>
                <p className="mt-2 text-sm text-ink-subtle">
                  Entrez votre numéro Mobile Money. Nous vous envoyons un code de vérification —{" "}
                  <span className="text-ink-muted">aucun mot de passe</span>.
                </p>

                <form onSubmit={sendCode} className="mt-6 space-y-4">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                      Numéro Mobile Money
                    </label>
                    <div className="mt-1.5 flex items-center rounded-xl border border-line/10 bg-base/40 focus-within:border-emerald-400/50">
                      <span className="border-r border-line/10 px-3 py-3 text-sm text-ink-subtle">
                        +221
                      </span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        autoFocus
                        value={phone}
                        onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                        placeholder="77 123 45 67"
                        className="w-full bg-transparent px-3 py-3 text-sm outline-none placeholder:text-ink-faint"
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="shine relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
                  >
                    Recevoir un code
                    <IconArrow className="h-4 w-4" />
                  </button>
                </form>
              </>
            ) : (
              <>
                <h1 className="mt-5 text-2xl font-bold tracking-tight">Vérification</h1>
                <p className="mt-2 text-sm text-ink-subtle">
                  Code envoyé au{" "}
                  <span className="font-mono text-ink-muted">+221 {formatPhoneInput(digits)}</span>.
                </p>

                <form onSubmit={verify} className="mt-6 space-y-4">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="••••••"
                    className="w-full rounded-xl border border-line/10 bg-base/40 px-3 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none placeholder:text-ink-faint focus:border-emerald-400/50"
                  />

                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-xs text-ink-subtle">
                    <IconShield className="h-4 w-4 shrink-0 text-accent" />
                    Démo — votre code :{" "}
                    <span className="font-mono font-bold text-accent">{sentCode}</span>
                  </div>

                  {error && (
                    <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
                  >
                    Se connecter
                  </button>

                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setStep("phone");
                        setError("");
                      }}
                      className="text-ink-subtle transition hover:text-ink"
                    >
                      Changer de numéro
                    </button>
                    <button
                      type="button"
                      onClick={resend}
                      disabled={cooldown > 0}
                      className={`font-medium transition ${
                        cooldown > 0 ? "cursor-not-allowed text-ink-faint" : "text-accent hover:underline"
                      }`}
                    >
                      {cooldown > 0 ? `Renvoyer (${cooldown}s)` : "Renvoyer le code"}
                    </button>
                  </div>
                </form>
              </>
            )}

            <p className="mt-6 flex items-center justify-center gap-1.5 border-t border-line/5 pt-4 text-center text-[11px] text-ink-faint">
              <IconShield className="h-3.5 w-3.5 text-accent" />
              Connexion sans mot de passe : votre numéro vous identifie.
            </p>
          </div>

          <p className="mt-5 text-center text-xs text-ink-faint">
            En continuant, vous acceptez l'usage de votre numéro pour sécuriser votre espace.
          </p>
        </div>
      </main>
    </div>
  );
}
