import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import UseCasePage from "./pages/UseCasePage";
import VendorLayout from "./layouts/VendorLayout";
import AdminLayout from "./layouts/AdminLayout";
import Overview from "./pages/vendor/Overview";
import Inbox from "./pages/vendor/Inbox";
import BotStudio from "./pages/vendor/BotStudio";
import Channels from "./pages/vendor/Channels";
import Appointments from "./pages/vendor/Appointments";
import Analytics from "./pages/vendor/Analytics";
import Billing from "./pages/vendor/Billing";
import Settings from "./pages/vendor/Settings";
import SalesAssistant from "./pages/vendor/SalesAssistant";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminVendors from "./pages/admin/AdminVendors";
import AdminBilling from "./pages/admin/AdminBilling";
import AdminAnalytics from "./pages/admin/AdminAnalytics";

function Protected({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10 font-mono">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/use-case/:slug" element={<UseCasePage />} />

            <Route path="/app" element={<Protected role="vendor"><VendorLayout /></Protected>}>
              <Route index element={<Overview />} />
              <Route path="inbox" element={<Inbox />} />
              <Route path="bot" element={<BotStudio />} />
              <Route path="channels" element={<Channels />} />
              <Route path="appointments" element={<Appointments />} />
              <Route path="sales" element={<SalesAssistant />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="billing" element={<Billing />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="/admin" element={<Protected role="superadmin"><AdminLayout /></Protected>}>
              <Route index element={<AdminOverview />} />
              <Route path="vendors" element={<AdminVendors />} />
              <Route path="billing" element={<AdminBilling />} />
              <Route path="analytics" element={<AdminAnalytics />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
