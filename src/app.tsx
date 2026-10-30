import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { AuthProvider } from "@/lib/auth-context";
import CatDesktopOverlay from "@/components/cat/CatDesktopOverlay";
import TicketNotesPage from "@/pages/TicketNotesPage/TicketNotesPage";
import NotFoundPage from "@/pages/NotFoundPage/NotFoundPage";

// DEV-only whisper engine benchmark (P0 spike). Lazy + conditional route so
// transformers.js / whisper.wasm bench imports never enter a prod bundle.
const WhisperBenchPage = import.meta.env.DEV
  ? lazy(() => import("@/pages/WhisperBenchPage"))
  : null;

export default function App() {
  // Desktop-cat overlay window (Tauri `cat-overlay`): a bare sprite page
  // outside the router/auth/shell chrome. Detected via a query param on the
  // URL the Rust command opens (index.html?window=cat-overlay).
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("window") === "cat-overlay"
  ) {
    return <CatDesktopOverlay />;
  }
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          {/* One persistent controller owns call capture and ticket state;
              workspace URLs change the active surface without remounting it. */}
          <Route path="*" element={<TicketNotesPage />} />
          {WhisperBenchPage && (
            <Route
              path="whisper-bench"
              element={
                <Suspense fallback={null}>
                  <WhisperBenchPage />
                </Suspense>
              }
            />
          )}
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}
