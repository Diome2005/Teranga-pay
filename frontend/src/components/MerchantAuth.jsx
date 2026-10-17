// [FICHIER] : frontend/src/components/MerchantAuth.jsx
// [RÔLE] : connexion du marchand — compte email + mot de passe (factures conservées),
//          ou connexion "sans friction" par code SMS (passwordless).
// [FLUX] : email + mot de passe (connexion/création) -> espace marchand ; en option,
//          numéro Mobile Money -> code OTP -> espace marchand.
// [UI] : Tailwind CSS — tokens de thème (clair/sombre) + accent émeraude. Sans emoji.
// [ÉTAPE 6] : branché au backend (/api/auth/register, /api/auth/login, /api/auth/otp).
//          Repli démo local de l'OTP si le backend est indisponible.

import { useEffect, useState } from "react";
import {
  login as apiLogin,
  register as apiRegister,
  requestOtp,
  verifyOtp,
} from "../services/api";

const PAGE_BG = "/images/dakar-city.jpg";
const OTP_COOLDOWN = 30;
const DEFAULT_SHOP = "Atelier Awa Couture";

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
const IconMail = (props) => (
  <Svg {...props}>
    <rect x="4" y="6" width="16" height="12" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </Svg>
);
const IconKey = (props) => (
  <Svg {...props}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11.5 12.5 8-8M17 3l3.5 3.5M14.5 5.5 17 8" />
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

const inputClass =
  "w-full rounded-xl border border-line/10 bg-base/40 px-3 py-3 text-sm outline-none placeholder:text-ink-faint focus:border-emerald-400/50";

export default function MerchantAuth({ onAuthenticated, onBack }) {
  // "password" = email + mot de passe (défaut) ; "otp" = code SMS (passwordless)
  const [mode, setMode] = useState("password");
  const [tab, setTab] = useState("login"); // "login" | "register"

  // --- Compte email + mot de passe ---
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // --- OTP (flux existant) ---
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentCode, setSentCode] = useState("");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [smsSent, setSmsSent] = useState(false); // backend en mode réel (pas de demoCode)

  const digits = phoneDigits(phone);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // [COMPTE] Connexion / création de compte email + mot de passe.
  const submitPassword = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Email et mot de passe requis.");
      return;
    }
    if (tab === "register") {
      if (password.length < 8) {
        setError("Le mot de passe doit faire au moins 8 caractères.");
        return;
      }
      if (digits.length !== 9) {
        setError(
          "Saisissez un numéro Mobile Money valide (9 chiffres) — il reçoit vos encaissements."
        );
        return;
      }
    }
    setSubmitting(true);
    setError("");
    try {
      const res =
        tab === "register"
          ? await apiRegister({
              email: email.trim(),
              password,
              phone: digits,
              shop: shopName.trim() || undefined,
            })
          : await apiLogin({ email: email.trim(), password });
      const session = res?.session || {};
      onAuthenticated?.({
        email: res?.email || email.trim().toLowerCase(),
        phone: session.phone || (digits ? `+221 ${formatPhoneInput(digits)}` : null),
        shop: session.shop || shopName.trim() || DEFAULT_SHOP,
        since: session.since || new Date().toISOString(),
        token: session.token || null,
      });
    } catch (err) {
      const message =
        err?.response?.data?.error ||
        (err?.response
          ? "Connexion impossible. Vérifiez vos identifiants."
          : "Backend indisponible — réessayez une fois le serveur lancé.");
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Appelle le backend pour générer un OTP ; repli local si backend absent.
  const sendCode = async (event) => {
    event.preventDefault();
    if (digits.length !== 9) {
      setError("Saisissez un numéro Mobile Money valide (9 chiffres).");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await requestOtp({ phone: digits });
      // Le backend renvoie demoCode uniquement en DEMO_MODE ; sinon le code part en SMS.
      setSentCode(res?.demoCode || "");
      setSmsSent(!res?.demoCode);
      setCode("");
      setStep("otp");
      setCooldown(res?.resendAfter || OTP_COOLDOWN);
    } catch {
      // Backend indisponible -> repli démo autonome (code affiché à l'écran).
      setSentCode(String(Math.floor(100000 + Math.random() * 900000)));
      setSmsSent(false);
      setCode("");
      setStep("otp");
      setCooldown(OTP_COOLDOWN);
    } finally {
      setSending(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setSending(true);
    setError("");
    try {
      const res = await requestOtp({ phone: digits });
      setSentCode(res?.demoCode || "");
      setSmsSent(!res?.demoCode);
      setCooldown(res?.resendAfter || OTP_COOLDOWN);
    } catch {
      setSentCode(String(Math.floor(100000 + Math.random() * 900000)));
      setSmsSent(false);
      setCooldown(OTP_COOLDOWN);
    } finally {
      setSending(false);
      setCode("");
    }
  };

  // Vérifie le code via le backend ; repli sur la comparaison locale si backend absent.
  const verify = async (event) => {
    event.preventDefault();
    setVerifying(true);
    setError("");
    try {
      const res = await verifyOtp({ phone: digits, code });
      const session = res?.session || {};
      onAuthenticated?.({
        email: res?.email || null,
        phone: session.phone || `+221 ${formatPhoneInput(digits)}`,
        shop: session.shop || DEFAULT_SHOP,
        since: session.since || new Date().toISOString(),
        token: session.token || null,
      });
    } catch (err) {
      const message =
        err?.response?.data?.error || "Code incorrect ou expiré. Vérifiez le code reçu.";
      setError(message);
    } finally {
      setVerifying(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setTab("login");
    setError("");
    setStep("phone");
    setCode("");
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

            {mode === "password" ? (
              <>
                <h1 className="mt-5 text-2xl font-bold tracking-tight">
                  {tab === "login" ? "Connectez-vous" : "Créez votre compte"}
                </h1>
                <p className="mt-2 text-sm text-ink-subtle">
                  {tab === "login"
                    ? "Email et mot de passe. Vos factures et encaissements sont conservés sur votre compte."
                    : "Un email, un mot de passe, et le numéro Mobile Money qui reçoit vos encaissements."}
                </p>

                <div
                  role="tablist"
                  aria-label="Connexion ou création de compte"
                  className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-line/10 bg-base/40 p-1 text-xs font-semibold"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "login"}
                    onClick={() => {
                      setTab("login");
                      setError("");
                    }}
                    className={`rounded-lg px-3 py-2 transition ${
                      tab === "login"
                        ? "bg-emerald-500/15 text-accent"
                        : "text-ink-subtle hover:text-ink"
                    }`}
                  >
                    Connexion
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "register"}
                    onClick={() => {
                      setTab("register");
                      setError("");
                    }}
                    className={`rounded-lg px-3 py-2 transition ${
                      tab === "register"
                        ? "bg-emerald-500/15 text-accent"
                        : "text-ink-subtle hover:text-ink"
                    }`}
                  >
                    Créer un compte
                  </button>
                </div>

                <form onSubmit={submitPassword} className="mt-5 space-y-4">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                      Email
                    </label>
                    <div className="mt-1.5 flex items-center rounded-xl border border-line/10 bg-base/40 focus-within:border-emerald-400/50">
                      <span className="pl-3 text-ink-subtle">
                        <IconMail className="h-4 w-4" />
                      </span>
                      <input
                        type="email"
                        autoFocus
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="awa@teranga.sn"
                        className="w-full bg-transparent px-3 py-3 text-sm outline-none placeholder:text-ink-faint"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                      Mot de passe
                    </label>
                    <div className="mt-1.5 flex items-center rounded-xl border border-line/10 bg-base/40 focus-within:border-emerald-400/50">
                      <span className="pl-3 text-ink-subtle">
                        <IconKey className="h-4 w-4" />
                      </span>
                      <input
                        type="password"
                        autoComplete={tab === "login" ? "current-password" : "new-password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={tab === "login" ? "Votre mot de passe" : "8 caractères minimum"}
                        className="w-full bg-transparent px-3 py-3 text-sm outline-none placeholder:text-ink-faint"
                      />
                    </div>
                  </div>

                  {tab === "register" && (
                    <>
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
                            value={phone}
                            onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                            placeholder="77 123 45 67"
                            className="w-full bg-transparent px-3 py-3 text-sm outline-none placeholder:text-ink-faint"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                          Nom de la boutique (optionnel)
                        </label>
                        <input
                          type="text"
                          value={shopName}
                          onChange={(e) => setShopName(e.target.value)}
                          placeholder="Atelier Awa Couture"
                          className={`mt-1.5 ${inputClass}`}
                        />
                      </div>
                    </>
                  )}

                  {error && (
                    <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="shine relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting
                      ? tab === "login"
                        ? "Connexion…"
                        : "Création du compte…"
                      : tab === "login"
                        ? "Se connecter"
                        : "Créer mon compte"}
                    <IconArrow className="h-4 w-4" />
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => switchMode("otp")}
                  className="mt-4 w-full rounded-lg border border-dashed border-line/15 px-3 py-2.5 text-xs text-ink-subtle transition hover:border-emerald-500/40 hover:text-accent"
                >
                  Pas de mot de passe ? Se connecter par code SMS
                </button>
              </>
            ) : step === "phone" ? (
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
                    disabled={sending}
                    className="shine relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sending ? "Envoi en cours…" : "Recevoir un code"}
                    <IconArrow className="h-4 w-4" />
                  </button>
                </form>

                <button
                  type="button"
                  onClick={() => switchMode("password")}
                  className="mt-4 w-full rounded-lg border border-dashed border-line/15 px-3 py-2.5 text-xs text-ink-subtle transition hover:border-emerald-500/40 hover:text-accent"
                >
                  Se connecter par email et mot de passe
                </button>
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

                  {sentCode ? (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-xs text-ink-subtle">
                      <IconShield className="h-4 w-4 shrink-0 text-accent" />
                      Démo — votre code :{" "}
                      <span className="font-mono font-bold text-accent">{sentCode}</span>
                    </div>
                  ) : smsSent ? (
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-line/15 bg-band/5 px-3 py-2 text-xs text-ink-subtle">
                      <IconShield className="h-4 w-4 shrink-0 text-accent" />
                      Code envoyé par SMS — saisissez-le pour continuer.
                    </div>
                  ) : null}

                  {error && (
                    <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={verifying}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {verifying ? "Vérification…" : "Se connecter"}
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
                      disabled={cooldown > 0 || sending}
                      className={`font-medium transition ${
                        cooldown > 0 || sending ? "cursor-not-allowed text-ink-faint" : "text-accent hover:underline"
                      }`}
                    >
                      {sending ? "Envoi…" : cooldown > 0 ? `Renvoyer (${cooldown}s)` : "Renvoyer le code"}
                    </button>
                  </div>
                </form>
              </>
            )}

            <p className="mt-6 flex items-center justify-center gap-1.5 border-t border-line/5 pt-4 text-center text-[11px] text-ink-faint">
              <IconShield className="h-3.5 w-3.5 text-accent" />
              {mode === "password"
                ? "Votre compte conserve vos factures et sécurise votre espace."
                : "Connexion sans mot de passe : votre numéro vous identifie."}
            </p>
          </div>

          <p className="mt-5 text-center text-xs text-ink-faint">
            {mode === "password"
              ? "Vos données restent liées à votre compte marchand."
              : "En continuant, vous acceptez l'usage de votre numéro pour sécuriser votre espace."}
          </p>
        </div>
      </main>
    </div>
  );
}
