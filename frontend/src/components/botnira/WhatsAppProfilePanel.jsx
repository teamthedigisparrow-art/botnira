import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { Camera, Save, Building, Globe, Mail, MapPin, FileText, Tag, MessageSquare, Clock, ExternalLink } from "lucide-react";

const VERTICALS = [
  ["UNDEFINED",      "— Select a category —"],
  ["OTHER",          "Other"],
  ["AUTO",           "Automotive"],
  ["BEAUTY",         "Beauty, Spa & Salon"],
  ["APPAREL",        "Clothing & Apparel"],
  ["EDU",            "Education"],
  ["ENTERTAIN",      "Entertainment"],
  ["EVENT_PLAN",     "Event Planning & Service"],
  ["FINANCE",        "Finance & Banking"],
  ["GROCERY",        "Food & Grocery"],
  ["GOVT",           "Public Service"],
  ["HOTEL",          "Hotel & Lodging"],
  ["HEALTH",         "Medical & Health"],
  ["NONPROFIT",      "Non-profit"],
  ["PROF_SERVICES",  "Professional Services"],
  ["RETAIL",         "Shopping & Retail"],
  ["TRAVEL",         "Travel & Transportation"],
  ["RESTAURANT",     "Restaurant"],
  ["NOT_A_BIZ",      "Not a business"],
];

export default function WhatsAppProfilePanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    about: "", description: "", address: "", email: "",
    websites: ["", ""], vertical: "UNDEFINED",
  });
  const [photoUrl, setPhotoUrl] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/whatsapp/profile");
      setForm({
        about: data.about || "",
        description: data.description || "",
        address: data.address || "",
        email: data.email || "",
        websites: [(data.websites && data.websites[0]) || "", (data.websites && data.websites[1]) || ""],
        vertical: data.vertical || "UNDEFINED",
      });
      setPhotoUrl(data.profile_picture_url || "");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load profile");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/whatsapp/profile", {
        about: form.about,
        description: form.description,
        address: form.address,
        email: form.email,
        websites: form.websites.filter((w) => w && w.trim()),
        vertical: form.vertical,
      });
      toast.success("WhatsApp profile updated — customers will see the new info");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed", { duration: 10000 });
    } finally { setSaving(false); }
  };

  const onPhotoChange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error("Image is too large — max 5 MB."); return;
    }
    if (!["image/jpeg", "image/png"].includes(f.type)) {
      toast.error("Use a JPG or PNG image."); return;
    }
    const fd = new FormData();
    fd.append("file", f);
    setPhotoBusy(true);
    try {
      await api.post("/whatsapp/profile/photo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Profile picture updated — refresh in WhatsApp to see it on your customers' chats");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Photo upload failed", { duration: 10000 });
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (loading) {
    return <div className="border-2 border-black bg-white p-6 font-mono text-sm" data-testid="wa-profile-loading">Loading WhatsApp profile…</div>;
  }

  return (
    <div className="border-2 border-black bg-white shadow-brutal" data-testid="wa-profile-panel">
      <div className="px-5 py-3 border-b-2 border-black flex items-center justify-between gap-3 flex-wrap bg-neutral-50">
        <div>
          <div className="text-xs font-bold tracking-[0.2em] uppercase text-[#25D366]">
            <Building size={11} className="inline -mt-0.5 mr-1" />
            WhatsApp Business Profile
          </div>
          <div className="font-display font-black text-xl mt-0.5">What your customers see</div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          data-testid="wa-profile-save"
          className="border-2 border-black px-5 py-2 text-sm font-bold bg-[#25D366] text-black shadow-brutal hover-lift disabled:opacity-60"
        >
          <Save size={14} className="inline -mt-0.5 mr-1" />
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <div className="p-5 grid md:grid-cols-[180px_1fr] gap-6">
        {/* Profile picture */}
        <div className="flex flex-col items-center">
          <div className="relative w-40 h-40 border-2 border-black bg-neutral-100 overflow-hidden">
            {photoUrl ? (
              <img src={photoUrl} alt="WhatsApp profile" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-400">
                <Camera size={36} />
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png"
            onChange={onPhotoChange}
            className="hidden"
            data-testid="wa-profile-photo-input"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={photoBusy}
            data-testid="wa-profile-photo-btn"
            className="mt-3 text-xs font-bold border-2 border-black px-3 py-1.5 bg-white hover-lift disabled:opacity-60"
          >
            <Camera size={12} className="inline -mt-0.5 mr-1" />
            {photoBusy ? "Uploading…" : "Change photo"}
          </button>
          <div className="text-[10px] text-neutral-500 mt-1 text-center font-mono leading-tight">
            JPG / PNG · ≤5 MB · square recommended (640×640+)
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-4">
          <Field label="Category" icon={Tag} testid="wa-profile-vertical">
            <select
              value={form.vertical}
              onChange={(e) => setForm((f) => ({ ...f, vertical: e.target.value }))}
              className="w-full border-2 border-black px-3 py-2"
            >
              {VERTICALS.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </Field>

          <Field
            label="About"
            icon={MessageSquare}
            hint={`The short line under your business name in WhatsApp. ${form.about.length}/139`}
            testid="wa-profile-about"
          >
            <input
              value={form.about}
              maxLength={139}
              onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))}
              placeholder="e.g. We answer 24/7 — book an appointment in seconds"
              className="w-full border-2 border-black px-3 py-2"
            />
          </Field>

          <Field
            label="Description"
            icon={FileText}
            hint={`Longer pitch shown in the business profile page. ${form.description.length}/512`}
            testid="wa-profile-description"
          >
            <textarea
              value={form.description}
              maxLength={512}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What does your business do? Who do you serve?"
              rows={4}
              className="w-full border-2 border-black px-3 py-2"
            />
          </Field>

          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Address" icon={MapPin} testid="wa-profile-address">
              <input
                value={form.address}
                maxLength={256}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="123 Main St, Toronto, ON"
                className="w-full border-2 border-black px-3 py-2"
              />
            </Field>
            <Field label="Email" icon={Mail} testid="wa-profile-email">
              <input
                type="email"
                value={form.email}
                maxLength={128}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="hello@yourdomain.com"
                className="w-full border-2 border-black px-3 py-2"
              />
            </Field>
          </div>

          <Field
            label="Websites"
            icon={Globe}
            hint="Up to 2 URLs — your homepage, booking page, menu, etc."
            testid="wa-profile-websites"
          >
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <input
                  key={i}
                  type="url"
                  value={form.websites[i] || ""}
                  onChange={(e) => {
                    const w = [...form.websites]; w[i] = e.target.value;
                    setForm((f) => ({ ...f, websites: w }));
                  }}
                  placeholder={i === 0 ? "https://yourbusiness.com" : "https://yourbusiness.com/book"}
                  className="w-full border-2 border-black px-3 py-2 font-mono text-sm"
                />
              ))}
            </div>
          </Field>
        </div>
      </div>

      {/* Business hours / greeting message — Meta doesn't expose this via API */}
      <div className="px-5 py-3 border-t-2 border-black bg-amber-50 text-xs flex gap-2 items-start">
        <Clock size={14} className="mt-0.5 text-amber-700 shrink-0" />
        <div>
          <strong>Business hours, greeting & away messages</strong> aren't editable via Meta's Cloud API yet — set them at{" "}
          <a
            href="https://business.facebook.com/wa/manage/phone-numbers/"
            target="_blank" rel="noreferrer"
            className="underline font-bold inline-flex items-center gap-0.5"
          >
            Meta WhatsApp Manager <ExternalLink size={10} />
          </a>{" "}
          → click your number → <em>Automations</em>. Note: BotNira's AI already handles "are you open?" / off-hours questions based on your bot training, so the Meta automated greeting is usually redundant.
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon: Icon, hint, children, testid }) {
  return (
    <div data-testid={testid}>
      <label className="text-xs font-bold uppercase tracking-widest text-neutral-700 flex items-center gap-1 mb-1">
        {Icon && <Icon size={11} />} {label}
      </label>
      {children}
      {hint && <div className="text-[10px] text-neutral-500 mt-1 font-mono">{hint}</div>}
    </div>
  );
}
