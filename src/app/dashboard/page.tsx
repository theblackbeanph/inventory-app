"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, BRANCH_LABELS, DEPARTMENT_LABELS } from "@/lib/auth";
import type { Branch, Department } from "@/lib/types";
import type { Role } from "@/lib/roles";
import BottomNav from "@/components/BottomNav";
import { VarianceReport } from "@/app/dashboard/_components/VarianceReport";

export default function DashboardPage() {
  const router = useRouter();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [department, setDept] = useState<Department | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    setBranch(session.branch);
    setDept(session.department);
    setRole(session.role);
  }, [router]);

  if (!branch || !department || !role) return null;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 16px)" }}>
      {/* Header */}
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
          {BRANCH_LABELS[branch]} · {DEPARTMENT_LABELS[department]}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Dashboard</div>
      </div>

      {/* Variance Report */}
      <div style={{ padding: "16px 16px 8px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
          Variance Report
        </div>
      </div>
      <VarianceReport branch={branch} department={department} role={role} />

      <BottomNav />
    </div>
  );
}
