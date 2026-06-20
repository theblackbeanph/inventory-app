"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSession, BRANCH_LABELS } from "@/lib/auth";
import { hasMinRole } from "@/lib/roles";
import type { Branch } from "@/lib/types";
import BottomNav from "@/components/BottomNav";
import ParLevelSettings from "./_components/ParLevelSettings";

export default function SettingsPage() {
  const router = useRouter();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    if (!hasMinRole(session.role, "admin")) { router.replace("/dashboard"); return; }
    setBranch(session.branch);
    setDisplayName(session.displayName);
  }, [router]);

  if (!branch) return null;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 16px)" }}>
      {/* Header */}
      <div style={{
        background: "#FFFFFF", borderBottom: "1px solid var(--border)",
        padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <Link href="/dashboard" style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 32, height: 32, borderRadius: 8, color: "var(--text-secondary)",
          textDecoration: "none", flexShrink: 0,
        }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
            {BRANCH_LABELS[branch]}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Settings</div>
        </div>
      </div>

      {/* Section label */}
      <div style={{ padding: "16px 16px 8px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
          Par Levels
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Par Level = order-up-to target · Low Alert = shows LOW badge below this qty
        </div>
      </div>

      <ParLevelSettings branch={branch} updatedBy={displayName} />

      <BottomNav />
    </div>
  );
}
