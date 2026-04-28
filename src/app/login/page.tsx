"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, BRANCH_LABELS, DEPARTMENT_LABELS } from "@/lib/auth";
import type { Branch, Department } from "@/lib/types";

type Step = "branch" | "dept" | "email";
const BRANCHES: Branch[] = ["MKT", "BF"];
const DEPARTMENTS: { id: Department; desc: string }[] = [
  { id: "kitchen", desc: "Daily food inventory" },
  { id: "bar",     desc: "Daily bar inventory" },
  { id: "cafe",    desc: "Monthly cafe stock" },
];

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("branch");
  const [branch, setBranch] = useState<Branch>("MKT");
  const [department, setDepartment] = useState<Department | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickBranch(b: Branch) {
    setBranch(b);
    setStep("dept");
  }

  function pickDept(d: Department) {
    setDepartment(d);
    setStep("email");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!department) return;
    setLoading(true);
    setError(null);
    try {
      // Branch/dept validation happens server-side in /api/auth/session
      await signIn(email, password, branch, department);
      await router.replace("/stock");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Check your email and password.");
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "var(--bg)", padding: "24px",
    }}>
      <div style={{ marginBottom: 48, textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.12em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
          The Black Bean
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>Branch Inventory</div>
      </div>

      {/* ── Step 1: Branch ── */}
      {step === "branch" && (
        <div style={{ width: "100%", maxWidth: 320 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16, textAlign: "center" }}>
            Select Branch
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {BRANCHES.map(b => (
              <button key={b} onClick={() => pickBranch(b)} style={{
                padding: "20px 24px", borderRadius: 16, border: "1.5px solid var(--border)",
                background: "#FFFFFF", cursor: "pointer", textAlign: "left",
                fontWeight: 700, fontSize: 17, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}>
                {BRANCH_LABELS[b]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step 2: Department ── */}
      {step === "dept" && (
        <div style={{ width: "100%", maxWidth: 320 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16, textAlign: "center" }}>
            {BRANCH_LABELS[branch]} · Select Department
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {DEPARTMENTS.map(d => (
              <button key={d.id} onClick={() => pickDept(d.id)} style={{
                padding: "20px 24px", borderRadius: 16, border: "1.5px solid var(--border)",
                background: "#FFFFFF", cursor: "pointer", textAlign: "left",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{DEPARTMENT_LABELS[d.id]}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 3 }}>{d.desc}</div>
              </button>
            ))}
          </div>
          <button onClick={() => setStep("branch")} style={{ marginTop: 24, background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, padding: "4px 8px" }}>
            ← Back
          </button>
        </div>
      )}

      {/* ── Step 3: Email + Password ── */}
      {step === "email" && department && (
        <div style={{ width: "100%", maxWidth: 320 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 24, textAlign: "center" }}>
            {BRANCH_LABELS[branch]} · {DEPARTMENT_LABELS[department]}
          </div>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              style={{
                padding: "14px 16px", borderRadius: 12, border: "1.5px solid var(--border)",
                fontSize: 15, background: "#FFFFFF", outline: "none",
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                padding: "14px 16px", borderRadius: 12, border: "1.5px solid var(--border)",
                fontSize: 15, background: "#FFFFFF", outline: "none",
              }}
            />
            {error && (
              <div style={{ color: "#DC2626", fontSize: 13, fontWeight: 500 }}>{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 8, padding: "14px", borderRadius: 12, border: "none",
                background: loading ? "#9CA3AF" : "#1A1A1A", color: "#FFFFFF",
                fontWeight: 600, fontSize: 15, cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
          <button onClick={() => setStep("dept")} style={{ marginTop: 20, background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, padding: "4px 8px" }}>
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
