"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBranchSession, setDepartment, logout, BRANCH_LABELS, DEPARTMENT_LABELS } from "@/lib/auth";
import type { Department } from "@/lib/types";

const DEPARTMENTS: { id: Department; desc: string }[] = [
  { id: "kitchen", desc: "Daily food inventory" },
  { id: "bar",     desc: "Beverage & spirits" },
  { id: "cafe",    desc: "Monthly cafe stock" },
];

export default function DepartmentPage() {
  const router = useRouter();
  const session = getBranchSession();

  useEffect(() => {
    if (!getBranchSession()) router.replace("/login");
  }, [router]);

  function pick(dept: Department) {
    setDepartment(dept);
    router.replace("/stock");
  }

  if (!session) return null;

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
            onClick={() => pick(dept.id)}
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
