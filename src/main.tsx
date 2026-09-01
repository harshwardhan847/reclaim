import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { ErrorBoundary } from "./ErrorBoundary";
import { ProProvider } from "./context/ProContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ProProvider>
        <App />
      </ProProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
