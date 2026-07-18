// src/app/settings/_components/AddUserSheet.tsx
"use client";
import { useRef, useState } from "react";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { db, auth, COLS } from "@/lib/firebase";
import { getSecondaryAuth } from "@/lib/firebase-secondary";
import type { Role } from "@/lib/roles";
import type { Branch, Department, UserDoc } from "@/lib/types";

interface Props {
  onClose: () => void;
  onCreated: (uid: string, userDoc: UserDoc & { uid: string }) => void;
}

const ROLES: Role[]        = ["staff", "admin", "superadmin"];
const BRANCHES             = ["MKT", "BF", "both"] as const;
const DEPARTMENTS          = ["kitchen", "bar", "cafe", "dining", "all"] as const;

const ROLE_LABELS: Record<Role, string> = {
  staff:      "Staff",
  admin:      "Admin",
  supervisor: "Supervisor",
  superadmin: "Superadmin",
};

export default function AddUserSheet({ onClose, onCreated }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [branch, setBranch]           = useState<Branch | "both">("MKT");
  const [department, setDepartment]   = useState<Department | "all">("kitchen");
  const [role, setRole]               = useState<Role>("staff");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const submittingRef                 = useRef(false);

  async function handleSubmit() {
    if (submittingRef.current) return;
    setError(null);
    submittingRef.current = true;
    setLoading(true);

    let uid: string | null = null;
    try {
      await auth.authStateReady();
      const secondaryAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      uid = cred.user.uid;

      const userDoc: UserDoc = { role, branch, department, displayName };
      try {
        await setDoc(doc(db, COLS.users, uid), userDoc);
      } catch {
        await signOut(secondaryAuth);
        setError("Account created but profile save failed — delete the account from Firebase Console before retrying.");
        return;
      }

      await signOut(secondaryAuth);
      onCreated(uid, { ...userDoc, uid });
    } catch (e: unknown) {
      if (uid === null) {
        const code = (e as { code?: string }).code;
        if (code === "auth/email-already-in-use") setError("An account with this email already exists.");
        else if (code === "auth/weak-password") setError("Password must be at least 6 characters.");
        else if (code === "auth/invalid-email") setError("Enter a valid email address.");
        else setError("Failed to create account. Try again.");
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  const valid = displayName.trim() && email.trim() && password.length >= 6;

  return (
    <>
      <div
        onClick={loading ? undefined : onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }}
      />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70,
        background: "#fff", borderRadius: "20px 20px 0 0",
        padding: "24px 20px 40px", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
        maxHeight: "90dvh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Add User</div>
          <button onClick={onClose} disabled={loading} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-secondary)", padding: 4 }}>✕</button>
        </div>

        {error && (
          <div style={{ background: "#FEF2F2", borderRadius: 10, padding: "10px 14px", color: "#DC2626", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        <Field label="Display Name">
          <input
            type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
            placeholder="e.g. Maria" style={inputStyle}
          />
        </Field>

        <Field label="Email">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="staff@theblackbean.ph" style={inputStyle}
          />
        </Field>

        <Field label="Temporary Password">
          <input
            type="text" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Min 6 characters" style={inputStyle}
          />
        </Field>

        <Field label="Branch">
          <SegmentedControl
            options={[...BRANCHES]}
            labels={{ MKT: "Makati", BF: "BF Homes", both: "Both" }}
            value={branch}
            onChange={v => setBranch(v as Branch | "both")}
          />
        </Field>

        <Field label="Department">
          <SegmentedControl
            options={[...DEPARTMENTS]}
            labels={{ kitchen: "Kitchen", bar: "Bar", cafe: "Cafe", dining: "Dining", all: "All" }}
            value={department}
            onChange={v => setDepartment(v as Department | "all")}
          />
        </Field>

        <Field label="Role">
          <SegmentedControl
            options={ROLES}
            labels={ROLE_LABELS}
            value={role}
            onChange={v => setRole(v as Role)}
          />
        </Field>

        <button
          onClick={handleSubmit}
          disabled={loading || !valid}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
            background: valid && !loading ? "#1A1A1A" : "#E5E7EB",
            color: valid && !loading ? "#fff" : "#9CA3AF",
            fontWeight: 700, fontSize: 15, cursor: valid && !loading ? "pointer" : "default",
            marginTop: 8,
          }}
        >
          {loading ? "Creating…" : "Create User"}
        </button>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function SegmentedControl({ options, labels, value, onChange }: {
  options: string[];
  labels: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: "7px 12px", borderRadius: 8, border: "1px solid",
            borderColor: value === opt ? "#1A1A1A" : "var(--border)",
            background: value === opt ? "#1A1A1A" : "#fff",
            color: value === opt ? "#fff" : "var(--text-secondary)",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          {labels[opt] ?? opt}
        </button>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 14,
  border: "1px solid var(--border)", borderRadius: 8,
  background: "#fff", outline: "none", boxSizing: "border-box",
};
