import { useEffect, useState } from "react";
import LandingPage from "./components/LandingPage";
import MerchantDashboard from "./components/MerchantDashboard";
import MerchantAuth from "./components/MerchantAuth";
import CheckoutPage from "./components/CheckoutPage";

const SESSION_KEY = "teranga-session";

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.phone ? parsed : null;
  } catch {
    return null;
  }
}

export default function App() {
  // Navigation par état : la Landing Page est la vue d'accueil principale.
  // 'landing'   -> accueil vitrine (par défaut)
  // 'dashboard' -> espace marchand (connexion passwordless requise)
  // 'checkout'  -> page publique client diaspora
  const [view, setView] = useState("landing");
  const [checkoutId, setCheckoutId] = useState(null);
  const [session, setSession] = useState(() => loadSession());

  // Lien de paiement partagé : /?pay=<id> ouvre directement le guichet client.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pay = params.get("pay");
    if (pay) {
      setCheckoutId(pay);
      setView("checkout");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Persistance de la session marchand (passwordless)
  useEffect(() => {
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* stockage indisponible */
    }
  }, [session]);

  const goToCheckout = (id) => {
    setCheckoutId(id);
    setView("checkout");
  };

  const renderView = () => {
    if (view === "dashboard") {
      if (!session) {
        return <MerchantAuth onAuthenticated={setSession} onBack={() => setView("landing")} />;
      }
      return (
        <MerchantDashboard
          session={session}
          onSessionChange={setSession}
          onLogout={() => setSession(null)}
          onViewChange={setView}
          onOpenCheckout={goToCheckout}
        />
      );
    }

    if (view === "checkout") {
      return <CheckoutPage invoiceId={checkoutId} onViewChange={setView} />;
    }

    return <LandingPage onEnterDashboard={() => setView("dashboard")} />;
  };

  return (
    <div key={view} className="animate-fade-in">
      {renderView()}
    </div>
  );
}
