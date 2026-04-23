"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBranchSession, setDepartment, setStaffName, logout, BRANCH_LABELS, DEPARTMENT_LABELS, STAFF_NAMES } from "@/lib/auth";
import type { Department } from "@/lib/types";

const DEPARTMENTS: { id: Department; desc: string }[] = [
  { id: "kitchen", desc: "Daily food inventory" },
  { id: "bar",     desc: "Daily bar inventory" },
  { id: "cafe",    desc: "Monthly cafe stock" },
];

type Step = "dept" | "name";

export default function DepartmentPage() {
  const router = useRouter();
  const session = getBranchSession();

  const [step, setStep] = useState<Step>("dept");
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);

  useEffect(() => {
    if (!getBranchSession()) router.replace("/login");
  }, [router]);

  function pickDept(dept: Department) {
    setDepartment(dept);
    setSelectedDept(dept);
    setStep("name");
  }

  function pickName(name: string) {
    setStaffName(name);
    router.replace("/stock");
  }

  if (!session) return null;

  // ── Step 1: Department ────────────────────────────────────────────────────────
  if (step === "dept") {
    return (
      <div style={{
        minHeight: "100dvh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "var(--bg)", padding: "24px",
      }}>
        <div style={{ marginBottom: 48, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.12em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
            The Black Bean · {BRANCH_LABELS[session.branch]}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>Select Department</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 320 }}>
          {DEPARTMENTS.map(dept => (
            <button
              key={dept.id}
              onClick={() => pickDept(dept.id)}
              style={{
                padding: "20px 24px", borderRadius: 16,
                border: "1.5px solid var(--border)",
                background: "#FFFFFF", cursor: "pointer", textAlign: "left",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 17 }}>{DEPARTMENT_LABELS[dept.id]}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 3 }}>{dept.desc}</div>
            </button>
          ))}
        </div>

        <button
          onClick={() => { logout(); router.replace("/login"); }}
          style={{ marginTop: 40, background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, padding: "4px 8px" }}
        >
          Log out
        </button>
      </div>
    );
  }

  // ── Step 2: Name ─────────────────────────────────────────────────────────────
  const names = selectedDept ? STAFF_NAMES[selectedDept] : [];

  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "var(--bg)", padding: "24px",
    }}>
      <div style={{ marginBottom: 48, textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.12em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
          {BRANCH_LABELS[session.branch]} · {selectedDept ? DEPARTMENT_LABELS[selectedDept] : ""}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>Who are you?</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 320 }}>
        {names.map(name => (
          <button
            key={name}
            onClick={() => pickName(name)}
            style={{
              padding: "16px 24px", borderRadius: 14,
              border: "1.5px solid var(--border)",
              background: "#FFFFFF", cursor: "pointer", textAlign: "left",
              fontWeight: 600, fontSize: 16,
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <button
        onClick={() => setStep("dept")}
        style={{ marginTop: 32, background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13, padding: "4px 8px" }}
      >
        ← Back
      </button>
    </div>
  );
}
