import "./App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import UseCasePage from "./pages/UseCasePage";
import SeoLandingPage from "./pages/SeoLandingPage";
import ReferralsMarketing from "./pages/ReferralsMarketing";
import Blog from "./pages/Blog";
import BlogDetail from "./pages/BlogDetail";
import AdminBlogs from "./pages/admin/AdminBlogs";
import ScrollToHash from "./components/ScrollToHash";
import { SEO_PAGES } from "./data/seoPages";
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
import Referrals from "./pages/vendor/Referrals";
import ReferralRedirect from "./pages/ReferralRedirect";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminVendors from "./pages/admin/AdminVendors";
import AdminBilling from "./pages/admin/AdminBilling";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminReferrals from "./pages/admin/AdminReferrals";

// Fires Meta Pixel + Google Analytics PageView on every SPA route change.
// Without this, gtag/fbq would only count the very first page load.
function RouteAnalytics() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const url = pathname + search;
    if (typeof window.fbq === "function") {
      window.fbq("track", "PageView");
    }
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", { page_path: url });
    }
  }, [pathname, search]);
  return null;
}

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
          <RouteAnalytics />
          <ScrollToHash />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/referrals" element={<ReferralsMarketing />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogDetail />} />
            <Route path="/r/:code" element={<ReferralRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/use-case/:slug" element={<UseCasePage />} />
            {SEO_PAGES.map((p) => (
              <Route key={p.slug} path={p.path} element={<SeoLandingPage slug={p.slug} />} />
            ))}

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
              <Route path="referrals" element={<Referrals />} />
            </Route>

            <Route path="/admin" element={<Protected role="superadmin"><AdminLayout /></Protected>}>
              <Route index element={<AdminOverview />} />
              <Route path="vendors" element={<AdminVendors />} />
              <Route path="billing" element={<AdminBilling />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="referrals" element={<AdminReferrals />} />
              <Route path="blogs" element={<AdminBlogs />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
