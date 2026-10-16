import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Thème par défaut : sombre (identité de marque). Préférence mémorisée.
try {
  const saved = localStorage.getItem("teranga-theme");
  document.documentElement.dataset.theme = saved === "light" ? "light" : "dark";
} catch {
  document.documentElement.dataset.theme = "dark";
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
