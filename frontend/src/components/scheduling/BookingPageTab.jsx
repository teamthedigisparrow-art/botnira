import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Copy, Check, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";

export default function BookingPageTab() {
  const { vendor } = useAuth();
  const [copied, setCopied] = useState(false);

  // Public booking pages live on the marketing domain. Fall back to the API
  // origin (preview) so the link is always clickable in every environment.
  const origin = process.env.REACT_APP_WIDGET_PUBLIC_URL || window.location.origin;
  const url = `${origin}/book/${vendor?.slug || ""}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); toast.success("Link copied"); setTimeout(() => setCopied(false), 2000); }
    catch { toast.error("Copy failed"); }
  };

  return (
    <div className="space-y-4" data-testid="booking-page-tab">
      <div className="border-2 border-black bg-white p-4 sm:p-6">
        <div className="font-display font-black text-xl flex items-center gap-2"><Link2 size={20} /> Your booking page</div>
        <p className="text-sm text-neutral-600 mt-1">Share this link anywhere — customers pick an appointment type and an open time slot. Bookings land straight in your Appointments list and respect your availability + buffers.</p>

        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          <div className="flex-1 border-2 border-black bg-neutral-950 text-white px-3 py-3 font-mono text-xs sm:text-sm break-all" data-testid="booking-url">{url}</div>
          <div className="flex gap-2">
            <button onClick={copy} data-testid="booking-copy-btn" className="flex-1 sm:flex-none bg-[#002FA7] text-white font-bold px-4 py-2 border-2 border-black shadow-brutal hover-lift flex items-center justify-center gap-2">
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
            <a href={url} target="_blank" rel="noreferrer" data-testid="booking-open-btn" className="flex-1 sm:flex-none border-2 border-black px-4 py-2 font-bold hover-lift bg-white flex items-center justify-center gap-2">
              <ExternalLink size={14} /> Open
            </a>
          </div>
        </div>

        <div className="mt-4 border-2 border-dashed border-black/40 p-4 text-sm text-neutral-700 space-y-1">
          <div className="font-bold">Where to use it</div>
          <ul className="list-disc pl-5 space-y-1">
            <li>Your website "Book now" button</li>
            <li>Instagram / Facebook bio, Google Business Profile</li>
            <li>Email signatures and WhatsApp auto-replies</li>
          </ul>
          <div className="mt-2 text-xs font-mono text-neutral-500">Tip: enable/disable the page and change hours anytime from the <strong>Availability</strong> tab.</div>
        </div>
      </div>
    </div>
  );
}
