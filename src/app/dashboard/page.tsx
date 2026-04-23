"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, BRANCH_LABELS, DEPARTMENT_LABELS } from "@/lib/auth";
import type { Branch, Department } from "@/lib/types";
import BottomNav from "@/components/BottomNav";
import { ReportsContent } from "@/app/stock/_components/ReportsContent";
import { CATALOG } from "@/lib/items";

export default function DashboardPage() {
  const router = useRouter();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [department, setDept] = useState<Department | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    setBranch(session.branch);
    setDept(session.department);
  }, [router]);

  if (!branch || !department) return null;

  const deptCatalog = CATALOG.filter(i =>
    i.department === department && (!i.branches || i.branches.includes(branch))
  );

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 16px)" }}>
      {/* Header */}
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
          {BRANCH_LABELS[branch]} · {DEPARTMENT_LABELS[department]}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Dashboard</div>
      </div>

      {/* Weekly summary */}
      <div style={{ padding: "16px 16px 8px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Weekly Stock Summary</div>
      </div>
      <ReportsContent branch={branch} department={department} items={deptCatalog} />

      <BottomNav />
    </div>
  );
}
