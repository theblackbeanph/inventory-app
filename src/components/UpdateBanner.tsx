"use client";
import { useEffect, useState } from "react";

const CURRENT = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "dev";
const POLL_MS = 5 * 60 * 1000;

export default function UpdateBanner() {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (CURRENT === "dev") return;

    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { version } = await res.json();
        if (version !== CURRENT) setOutdated(true);
      } catch {
        // silently ignore network errors
      }
    }

    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, []);

  if (!outdated) return null;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: "#1A1A1A", color: "#fff",
      padding: "12px 16px",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
    }}>
      <span style={{ fontSize: 13, fontWeight: 500 }}>
        A new version is available — please refresh to stay up to date.
      </span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: "#fff", color: "#1A1A1A",
          border: "none", borderRadius: 8,
          padding: "6px 14px", fontSize: 13, fontWeight: 700,
          cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
        }}
      >
        Refresh
      </button>
    </div>
  );
}
