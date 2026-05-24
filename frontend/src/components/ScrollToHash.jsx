import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Mounted once near the top of <Routes>. Listens to location changes and
 * smooth-scrolls to the #hash target. Works for both same-page (`#pricing`)
 * and cross-page (`/#pricing` from /referrals) navigation. Without this,
 * <Link to="/#pricing"> just changes the URL without scrolling.
 */
export default function ScrollToHash() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      // Plain route change — start at the top.
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      return;
    }
    // Wait a tick so the target route's content is in the DOM.
    const id = hash.slice(1);
    let attempts = 0;
    const tick = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (attempts < 10) {
        attempts += 1;
        setTimeout(tick, 60);
      }
    };
    setTimeout(tick, 0);
  }, [pathname, hash]);

  return null;
}
