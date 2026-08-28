import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@uppy/react/css/style.css";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("The Uppy example root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
