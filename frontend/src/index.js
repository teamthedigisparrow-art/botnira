import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// react-snap prerenders each public route to static HTML at build time. When the
// browser loads that prerendered markup, hydrate it (root already has children);
// otherwise (dev / non-prerendered) mount fresh.
const container = document.getElementById("root");
const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (container.hasChildNodes()) {
  ReactDOM.hydrateRoot(container, app);
} else {
  ReactDOM.createRoot(container).render(app);
}
