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
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AutonomyPage = lazy(() => import("./pages/AutonomyPage"));
const StaffPage = lazy(() => import("./pages/StaffPage"));
const WelcomePage = lazy(() => import("./pages/WelcomePage"));
const CheckInPage = lazy(() => import("./pages/CheckInPage"));

const loading = (page: ReactNode) => (
  <Suspense
    fallback={
      <p className="text-sm text-slate-400" role="status">
        Loading…
      </p>
    }
  >
    {page}
  </Suspense>
);

export default function App() {
  return (
    <Routes>
      <Route path="welcome" element={loading(<WelcomePage />)} />
      <Route path="check-in" element={loading(<CheckInPage />)} />
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/autonomy" replace />} />
        <Route path="autonomy" element={loading(<AutonomyPage />)} />
        <Route path="staff" element={loading(<StaffPage />)} />
        <Route path="floor" element={<FloorPage />} />
        <Route path="videos" element={<VideosPage />} />
        <Route path="live" element={<LiveMonitorPage />} />
        <Route path="setup/:videoId?" element={loading(<TableSetupPage />)} />
        <Route path="supervisor" element={loading(<SupervisorPage />)} />
        <Route path="operations" element={loading(<OperationsPage />)} />
        <Route path="settings" element={loading(<SettingsPage />)} />
        <Route
          path="analytics"
          element={<Navigate to="/operations?tab=analytics" replace />}
        />
        <Route path="*" element={<Navigate to="/floor" replace />} />
      </Route>
    </Routes>
  );
}
