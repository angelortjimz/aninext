import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../style.css";
import { App } from "./App";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Application root was not found.");

createRoot(app).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
