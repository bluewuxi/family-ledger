import { StartupFailure } from "./components/StartupFailure";
import { lazy, Suspense, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "./App";
import { initializeRuntimeConfig } from "./lib/runtimeConfig";
import { clearLegacyAuthStorage } from "./lib/authClient";
import { initializeI18n } from "./i18n/instance";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { isLocalLanguagePreview } from "./i18n/language";
import "./styles.css";

const root = createRoot(document.getElementById("root") as HTMLElement);
const Preview = import.meta.env.DEV && isLocalLanguagePreview(import.meta.env.DEV, window.location.hostname)
  ? lazy(() => import("./i18n/DevelopmentLanguagePreview").then(module => ({default: module.DevelopmentLanguagePreview})))
  : null;

function DevelopmentPreview() {
  return Preview ? <Suspense fallback={null}><Preview /></Suspense> : null;
}

initializeI18n().then(() => initializeRuntimeConfig())
  .then(() => {
    clearLegacyAuthStorage();
    root.render(
      <StrictMode>
        <LanguageProvider>
          <RouterProvider router={createBrowserRouter([{ path: "*", element: <App /> }])} />
          <DevelopmentPreview />
        </LanguageProvider>
      </StrictMode>
    );
  })
  .catch((error: unknown) => {
    console.error(error);
    root.render(
      <StrictMode>
        <LanguageProvider>
        <StartupFailure />
        <DevelopmentPreview />
        </LanguageProvider>
      </StrictMode>
    );
  });
