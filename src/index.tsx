import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import App from "./app";
import "./index.css";

/**
 * Lightweight replacement for @lark-apaas/client-toolkit-lite's AppContainer + ErrorRender.
 * The toolkit pulled in ~735 kB of Feishu-only runtime (auth SDK, Slardar, penpal, Miaoda
 * inspector, ...) which is completely unnecessary for a standalone Vercel deployment.
 *
 * We only used two things from it:
 *   - AppContainer: a plain fragment wrapper for the Feishu iframe host (unused when standalone)
 *   - ErrorRender: a simple error-boundary fallback view
 *   - scopedStorage: a localStorage wrapper (moved to hooks/use-scoped-state.ts inline)
 */
function StandaloneAppContainer({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function StandaloneErrorRender({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        padding: 24,
        fontFamily:
          '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
        color: "#c9d1d9",
        background: "#0d1117",
        minHeight: "100vh",
      }}
    >
      <div
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: 24,
          border: "1px solid #30363d",
          borderRadius: 8,
          background: "rgba(22, 27, 34, 0.8)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
      >
        <h1
          style={{
            margin: "0 0 12px",
            fontSize: 18,
            color: "#f85149",
          }}
        >
          ⚠ Something went wrong
        </h1>
        <pre
          style={{
            margin: "0 0 16px",
            padding: 12,
            borderRadius: 6,
            background: "#161b22",
            border: "1px solid #30363d",
            fontSize: 13,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color: "#ff7b72",
          }}
        >
{error?.stack ?? String(error)}
        </pre>
        <button
          onClick={resetErrorBoundary}
          style={{
            padding: "8px 16px",
            background: "#238636",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 14,
          }}
        >
          ↻ Try again
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter
      basename={
        // process.env.* is replaced at build time by Vite's `define`
        // (see vite.config.ts). When set, it holds the Miaoda PaaS base path;
        // otherwise we fall back to "/" for standalone / Vercel deployments.
        (globalThis as any).process?.env?.CLIENT_BASE_PATH ||
          (import.meta as any).env?.BASE_URL ||
          "/"
      }
    >
      <StandaloneAppContainer>
        <ErrorBoundary
          fallbackRender={({ error, resetErrorBoundary }) => (
            <StandaloneErrorRender
              error={error as Error}
              resetErrorBoundary={resetErrorBoundary}
            />
          )}
        >
          <App />
        </ErrorBoundary>
      </StandaloneAppContainer>
    </BrowserRouter>
  </StrictMode>,
);
