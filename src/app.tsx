import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import TicketNotesPage from "@/pages/TicketNotesPage/TicketNotesPage";
import NotFoundPage from "@/pages/NotFoundPage/NotFoundPage";

// DEV-only whisper engine benchmark (P0 spike). Lazy + conditional route so
// transformers.js / whisper.wasm bench imports never enter a prod bundle.
const WhisperBenchPage = import.meta.env.DEV
  ? lazy(() => import("@/pages/WhisperBenchPage"))
  : null;

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TicketNotesPage />} />
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
  );
}
