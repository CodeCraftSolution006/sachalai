import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "highlight.js/styles/github-dark.css";
import "./index.css";

// Disable the default webview context menu outside editable fields for a native feel.
window.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest("input, textarea, .md, .bubble-user, .r-text")) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
