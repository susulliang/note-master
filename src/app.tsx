import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import TicketNotesPage from "@/pages/TicketNotesPage/TicketNotesPage";
import NotFoundPage from "@/pages/NotFoundPage/NotFoundPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TicketNotesPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
