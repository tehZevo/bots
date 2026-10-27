import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { AuthGate } from "./auth.tsx";
import { DeviceApproval } from "./device-approval.tsx";
import { attachScrollIndicators } from "./scrollbars.ts";
import { applyTheme, watchSystemTheme } from "./theme.ts";
import "./styles.css";

applyTheme();
watchSystemTheme();

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

createRoot(root).render(
  location.pathname === "/device" ? (
    <AuthGate>
      <DeviceApproval />
    </AuthGate>
  ) : (
    <AuthGate>
      <App />
    </AuthGate>
  ),
);

attachScrollIndicators();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
