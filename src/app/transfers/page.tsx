"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, BRANCH_LABELS } from "@/lib/auth";
import type { Branch } from "@/lib/types";
import BottomNav from "@/components/BottomNav";
import { PullOutsContent } from "./_components/PullOutsContent";
import { DeliveriesContent } from "./_components/DeliveriesContent";

type Tab = "pullouts" | "deliveries";

export default function TransfersPage() {
  const router = useRouter();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [tab, setTab] = useState<Tab>("pullouts");

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    if (session.department !== "kitchen") { router.replace("/stock"); return; }
    setBranch(session.branch);
  }, [router]);

  if (!branch) return null;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 16px)" }}>
      {/* Header */}
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid var(--border)", padding: "16px 16px 0", position: "sticky", top: 0, zIndex: 40 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
            {BRANCH_LABELS[branch]}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Transfers</div>
        </div>

        {/* Main tabs */}
        <div style={{ display: "flex", gap: 2 }}>
          {([
            { id: "pullouts",    label: "Pull Outs" },
            { id: "deliveries",  label: "Deliveries" },
          ] as { id: Tab; label: string }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "9px 4px", border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 13, background: "transparent",
              color: tab === t.id ? "#1A1A1A" : "var(--text-secondary)",
              borderBottom: tab === t.id ? "2px solid #1A1A1A" : "2px solid transparent",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab === "pullouts"   && <PullOutsContent branch={branch} />}
      {tab === "deliveries" && <DeliveriesContent branch={branch} />}

      <BottomNav />
    </div>
  );
}
