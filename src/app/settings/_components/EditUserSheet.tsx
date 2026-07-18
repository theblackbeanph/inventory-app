// src/app/settings/_components/EditUserSheet.tsx
"use client";
import { useRef, useState } from "react";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { db, auth, COLS } from "@/lib/firebase";
import type { Role } from "@/lib/roles";
import type { Branch, Department, UserDoc } from "@/lib/types";

interface UserRow extends UserDoc { uid: string; }

interface Props {
  user: UserRow;
  onClose: () => void;
  onUpdated: (uid: string, userDoc: UserDoc) => void;
  onDeleted: (uid: string) => void;
}

const ROLES: Role[]   = ["staff", "admin", "superadmin"];
const BRANCHES        = ["MKT", "BF", "both"] as const;
const DEPARTMENTS     = ["kitchen", "bar", "cafe", "dining", "all"] as const;

const ROLE_LABELS: Record<Role, string> = {
  staff:      "Staff",
  admin:      "Admin",
  supervisor: "Supervisor",
  superadmin: "Superadmin",
};

export default function EditUserSheet({ user, onClose, onUpdated, onDeleted }: Props) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [branch, setBranch]           = useState(user.branch);
  const [department, setDepartment]   = useState(user.department);
  const [role, setRole]               = useState(user.role);
  const [loading, setLoading]         = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const submittingRef                 = useRef(false);

  async function handleSave() {
    if (submittingRef.current) return;
    setError(null);
    submittingRef.current = true;
    setLoading(true);
    try {
      await auth.authStateReady();
      const updated: UserDoc = { role, branch, department, displayName };
      await setDoc(doc(db, COLS.users, user.uid), updated, { merge: true });
      onUpdated(user.uid, updated);
    } catch {
      setError("Save failed. Try again.");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setDeleting(true);
    try {
      await auth.authStateReady();
      await deleteDoc(doc(db, COLS.users, user.uid));
      onDeleted(user.uid);
    } catch {
      setError("Delete failed. Try again.");
    } finally {
      submittingRef.current = false;
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        onClick={loading || deleting ? undefined : onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60 }}
      />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70,
        background: "#fff", borderRadius: "20px 20px 0 0",
        padding: "24px 20px 40px", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
        maxHeight: "90dvh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Edit User</div>
          <button onClick={onClose} disabled={loading || deleting} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-secondary)", padding: 4 }}>✕</button>
        </div>

        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 20 }}>{user.uid}</div>

        {error && (
          <div style={{ background: "#FEF2F2", borderRadius: 10, padding: "10px 14px", color: "#DC2626", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <Field label="Display Name">
          <input
            type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
            style={inputStyle}
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
          onClick={handleSave}
          disabled={loading || deleting}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
            background: loading || deleting ? "#E5E7EB" : "#1A1A1A",
            color: loading || deleting ? "#9CA3AF" : "#fff",
            fontWeight: 700, fontSize: 15,
            cursor: loading || deleting ? "default" : "pointer",
            marginTop: 8, marginBottom: 12,
          }}
        >
          {loading ? "Saving…" : "Save Changes"}
        </button>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={loading || deleting}
            style={{
              width: "100%", padding: "13px 0", borderRadius: 12,
              border: "1px solid #FCA5A5", background: "#FFF",
              color: "#DC2626", fontWeight: 600, fontSize: 14, cursor: "pointer",
            }}
          >
            Remove Access
          </button>
        ) : (
          <div style={{ background: "#FEF2F2", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 13, color: "#DC2626", fontWeight: 600, marginBottom: 10 }}>
              Remove {user.displayName}&apos;s access? Their Firebase Auth account remains — they just can&apos;t log in.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                {deleting ? "Removing…" : "Confirm"}
              </button>
            </div>
          </div>
        )}
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
