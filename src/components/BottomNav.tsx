"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSession } from "@/lib/auth";
import type { Department } from "@/lib/types";

const ALL_TABS = [
  { href: "/stock",    icon: StockIcon,    label: "Stock",    kitchenOnly: false },
  { href: "/pullout",  icon: PullOutIcon,  label: "Pull Out", kitchenOnly: true  },
  { href: "/delivery", icon: DeliveryIcon, label: "Delivery", kitchenOnly: true  },
  { href: "/history",  icon: HistoryIcon,  label: "History",  kitchenOnly: false },
];

export default function BottomNav() {
  const path = usePathname();
  const [department, setDepartment] = useState<Department | null>(null);

  useEffect(() => {
    const session = getSession();
    if (session) setDepartment(session.department);
  }, []);

  const tabs = ALL_TABS.filter(t => !t.kitchenOnly || department === "kitchen");

  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      height: "var(--nav-h)", background: "#FFFFFF",
      borderTop: "1px solid var(--border)",
      display: "flex", alignItems: "stretch",
      paddingBottom: "env(safe-area-inset-bottom)",
      zIndex: 50,
    }}>
      {tabs.map(({ href, icon: Icon, label }) => {
        const active = path.startsWith(href);
        return (
          <Link key={href} href={href} style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 3,
            textDecoration: "none", color: active ? "#1A1A1A" : "#9CA3AF",
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

function StockIcon({ size, active }: { size: number; active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <rect x="2" y="10" width="20" height="5" rx="1" />
      <rect x="2" y="17" width="20" height="4" rx="1" />
    </svg>
  );
}

function PullOutIcon({ size, active }: { size: number; active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M12 12h4M12 16h4M8 12h.01M8 16h.01" />
    </svg>
  );
}

function DeliveryIcon({ size, active }: { size: number; active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" />
      <rect x="9" y="11" width="14" height="10" rx="1" />
      <path d="M9 17h14" />
    </svg>
  );
}

function HistoryIcon({ size, active }: { size: number; active: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}
