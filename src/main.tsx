import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Флаг для сторожа запуска в index.html: React смонтировался,
// диагностический экран не показывать.
(window as unknown as { __vpn_booted?: boolean }).__vpn_booted = true;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
