import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { AuthGate } from "./auth.tsx";
import { attachScrollIndicators } from "./scrollbars.ts";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

createRoot(root).render(
  <AuthGate>
    <App />
  </AuthGate>,
);

attachScrollIndicators();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
