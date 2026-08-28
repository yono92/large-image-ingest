import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "large-image-ingest/react-ui/styles.css";
import "./example-theme.css";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Reference application root is missing.");
createRoot(root).render(<StrictMode><App /></StrictMode>);
