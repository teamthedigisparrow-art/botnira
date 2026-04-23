import { useEffect, useRef, useState } from "react";

/**
 * ConnectWhatsAppButton — launches Meta's Embedded Signup popup using
 * Facebook Login for Business. On success the popup posts an auth `code`
 * back to window.opener via `postMessage`, which we catch and exchange
 * on the BotNira backend for the vendor's WhatsApp assets.
 *
 * This button is wired and ready to use the moment your Meta App Review
 * is approved — no code change required; we just need META_EMBEDDED_SIGNUP_CONFIG_ID
 * set in backend/.env and the frontend fetches it automatically.
 */
export default function ConnectWhatsAppButton({ config, onSuccess, onError }) {
  const [loading, setLoading] = useState(false);
  const sdkReady = useRef(false);

  // Inject Facebook SDK once
  useEffect(() => {
    if (sdkReady.current || document.getElementById("fb-jssdk")) {
      sdkReady.current = true;
      return;
    }
    const s = document.createElement("script");
    s.id = "fb-jssdk";
    s.async = true;
    s.defer = true;
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.onload = () => {
      window.FB?.init({
        appId: config.app_id,
        cookie: true,
        xfbml: true,
        version: config.graph_version || "v22.0",
      });
      sdkReady.current = true;
    };
    document.body.appendChild(s);
  }, [config.app_id, config.graph_version]);

  // Receive the message that Meta's popup posts to the opener window
  useEffect(() => {
    const handler = (event) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data && data.type === "WA_EMBEDDED_SIGNUP") {
          if (data.event === "FINISH") {
            onSuccess?.(data.data);
          } else if (data.event === "CANCEL") {
            onError?.({ cancelled: true });
          }
        }
      } catch {
        /* ignore non-JSON messages */
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onSuccess, onError]);

  const launch = () => {
    if (!config.config_id) {
      onError?.({
        message:
          "Embedded Signup is not yet available. Meta App Review for BotNira is pending; this button goes live the moment it's approved.",
      });
      return;
    }
    if (!window.FB) {
      onError?.({ message: "Facebook SDK not loaded yet — try again in a moment." });
      return;
    }
    setLoading(true);
    window.FB.login(
      (response) => {
        setLoading(false);
        if (!response.authResponse || !response.authResponse.code) {
          onError?.({ message: "Signup cancelled or denied." });
          return;
        }
        // The `code` is short-lived; backend exchanges it for a durable token.
        onSuccess?.({ code: response.authResponse.code });
      },
      {
        config_id: config.config_id,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "whatsapp_embedded_signup", sessionInfoVersion: "3" },
      }
    );
  };

  const disabled = loading || !config.config_id;
  return (
    <button
      type="button"
      onClick={launch}
      disabled={loading}
      data-testid="connect-whatsapp-btn"
      className={`inline-flex items-center gap-2 font-bold px-5 py-3 border-2 border-black shadow-brutal hover-lift ${
        disabled ? "bg-neutral-200 text-neutral-600" : "bg-[#25D366] text-black"
      }`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.966-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M20.52 3.449C12.831-3.984.106 1.407.101 11.893c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.652a11.82 11.82 0 005.692 1.451h.005c9.354 0 17.01-9.376 10.488-20.35zM12.04 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.975 1-3.645-.235-.374a9.848 9.848 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.82 9.82 0 012.893 6.994c-.002 5.45-4.437 9.888-9.887 9.888z" />
      </svg>
      {loading
        ? "Opening Meta…"
        : !config.config_id
        ? "Connect WhatsApp (waiting on Meta approval)"
        : "Connect WhatsApp"}
    </button>
  );
}
