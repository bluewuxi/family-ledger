import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { initializeRuntimeConfig } from "./lib/runtimeConfig";
import { initializeSupabaseClient } from "./lib/supabase";
import "./styles.css";

const root = createRoot(document.getElementById("root") as HTMLElement);

initializeRuntimeConfig()
  .then((config) => {
    initializeSupabaseClient(config);
    root.render(
      <StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </StrictMode>
    );
  })
  .catch((error: unknown) => {
    console.error(error);
    root.render(
      <StrictMode>
        <main className="login-page">
          <section className="login-panel" aria-labelledby="config-error-title">
            <p className="eyebrow">family-ledger</p>
            <h1 id="config-error-title">应用配置加载失败</h1>
            <p className="login-note">请检查 config.json 或 Vite 环境变量配置。</p>
          </section>
        </main>
      </StrictMode>
    );
  });
