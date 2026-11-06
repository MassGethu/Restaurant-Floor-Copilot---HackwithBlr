import "./supervisor.css";
import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import FloorPage from "./pages/FloorPage";
import Layout from "./components/Layout";
import LiveMonitorPage from "./pages/LiveMonitorPage";
import VideosPage from "./pages/VideosPage";

// The table editor and the charts bring big libraries; load them only when opened.
const TableSetupPage = lazy(() => import("./pages/TableSetupPage"));
const SupervisorPage = lazy(() => import("./pages/SupervisorPage"));
const OperationsPage = lazy(() => import("./pages/OperationsPage"));

const loading = (page: ReactNode) => (
  <Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}>
    {page}
  </Suspense>
);

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/floor" replace />} />
        <Route path="floor" element={<FloorPage />} />
        <Route path="videos" element={<VideosPage />} />
        <Route path="live" element={<LiveMonitorPage />} />
        <Route path="setup/:videoId?" element={loading(<TableSetupPage />)} />
        <Route path="supervisor" element={loading(<SupervisorPage />)} />
        <Route path="operations" element={loading(<OperationsPage />)} />
        <Route
          path="analytics"
          element={<Navigate to="/operations?tab=analytics" replace />}
        />
        <Route path="*" element={<Navigate to="/floor" replace />} />
      </Route>
    </Routes>
  );
}
