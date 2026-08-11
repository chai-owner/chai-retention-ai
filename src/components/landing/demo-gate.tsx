// Lead-capture gate in front of the public product demo. Visitors give their
// name, email, company (and optional website) before ChAi opens the sample-data
// demo. Rows land in public.demo_leads, which admins browse in /admin.
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function useDemoGate() {
  const [open, setOpen] = useState(false);
  return { open, openGate: () => setOpen(true), closeGate: () => setOpen(false) };
}

export function DemoGateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = {
      name: name.trim(),
      email: email.trim(),
      company: company.trim(),
      website: website.trim() || null,
    };
    if (!trimmed.name || !trimmed.email || !trimmed.company) {
      toast.error("Please fill in your name, email and company");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed.email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("demo_leads").insert(trimmed);
    setBusy(false);
    if (error) {
      // Duplicate email (unique index on lower(email)) — don't save again, just let them in.
      if (error.code === "23505") {
        toast.success("We've already got your details! You'll hear from us soon.");
      } else {
        toast.error("Couldn't start the demo. Please try again.");
        return;
      }
    }
    onClose();
    navigate({ to: "/app/dashboard", search: { demo: true } });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#0B1220]/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="View the ChAi demo"
        className="relative w-full max-w-md rounded-3xl border border-border bg-card p-7 shadow-2xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="text-xl font-semibold tracking-tight">View the ChAi demo</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Tell us a little about you and we'll open the live sample-data demo right away.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3.5">
          <Field label="Full name" value={name} onChange={setName} placeholder="Alex Morgan" />
          <Field
            label="Work email"
            value={email}
            onChange={setEmail}
            placeholder="alex@company.com"
            type="email"
          />
          <Field label="Company" value={company} onChange={setCompany} placeholder="Northwind Labs" />
          <Field
            label="Website (optional)"
            value={website}
            onChange={setWebsite}
            placeholder="https://company.com"
            required={false}
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Show me the demo
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary"
      />
    </label>
  );
}
