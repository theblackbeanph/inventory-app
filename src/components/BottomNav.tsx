"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSession } from "@/lib/auth";
import { hasMinRole } from "@/lib/roles";
import type { Role } from "@/lib/roles";

const ALL_TABS: { href: string; icon: React.FC<IconProps>; label: string; minRole: Role }[] = [
  { href: "/stock",      icon: StockIcon,      label: "Stock",      minRole: "linecook"   },
  { href: "/transfers",  icon: TransfersIcon,  label: "Transfers",  minRole: "superadmin" },
  { href: "/production", icon: ProductionIcon, label: "Production", minRole: "superadmin" },
  { href: "/dashboard",  icon: DashboardIcon,  label: "Dashboard",  minRole: "linecook"   },
];

interface IconProps { size: number; active: boolean }

export default function BottomNav() {
  const path = usePathname();
  const [role] = useState<Role | null>(() => getSession()?.role ?? null);

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      height: "var(--nav-h)", background: "#FFFFFF",
      borderTop: "1px solid var(--border)",
      display: "flex", alignItems: "stretch",
      paddingBottom: "env(safe-area-inset-bottom)",
      zIndex: 50,
    }}>
      {ALL_TABS.map(({ href, icon: Icon, label, minRole }) => {
        const active = path.startsWith(href);
        const allowed = role !== null && hasMinRole(role, minRole);

        if (!allowed) {
          return (
            <div key={href} style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 3,
              color: "#D1D5DB", fontSize: 10, position: "relative",
              userSelect: "none",
            }}>
              <Icon size={21} active={false} />
              {label}
              <span style={{
                position: "absolute", top: 6, right: "calc(50% - 20px)",
                fontSize: 8, fontWeight: 600, background: "#F3F4F6",
                color: "#9CA3AF", borderRadius: 3, padding: "1px 4px",
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}>
                soon
              </span>
            </div>
          );
        }

        return (
          <Link key={href} href={href} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 3,
            textDecoration: "none",
            color: active ? "#1A1A1A" : "#9CA3AF",
            fontWeight: active ? 600 : 400, fontSize: 10,
            transition: "color 0.15s",
          }}>
            <Icon size={21} active={active} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function StockIcon({ size, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <rect x="2" y="10" width="20" height="5" rx="1" />
      <rect x="2" y="17" width="20" height="4" rx="1" />
    </svg>
  );
}

function TransfersIcon({ size, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12H19M19 12l-4-4M19 12l-4 4" />
      <path d="M19 6H5M5 6l4-4M5 6l4 4" />
    </svg>
  );
}

function ProductionIcon({ size, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h20" />
      <path d="M5 20V8l7-6 7 6v12" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function DashboardIcon({ size, active }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
