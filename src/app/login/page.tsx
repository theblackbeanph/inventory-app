"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, BRANCH_LABELS } from "@/lib/auth";
import type { Branch } from "@/lib/types";

const BRANCHES: Branch[] = ["MKT", "BF"];

export default function LoginPage() {
  const router = useRouter();
  const [branch, setBranch] = useState<Branch>("MKT");
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  function tap(digit: string) {
    if (pin.length >= 6) return;
    const next = pin + digit;
    setPin(next);
    setError(false);
    if (next.length >= 4) attemptLogin(branch, next);
  }

  function del() {
    setPin(p => p.slice(0, -1));
    setError(false);
  }

  function attemptLogin(b: Branch, p: string) {
    if (login(b, p)) {
      router.replace("/department");
    } else if (p.length >= 4) {
      setError(true);
      setShake(true);
      setTimeout(() => { setPin(""); setShake(false); }, 600);
    }
  }

  const dots = Array.from({ length: 4 }).map((_, i) => (
    <div
      key={i}
      style={{
        width: 14, height: 14, borderRadius: "50%",
        background: i < pin.length ? "#1A1A1A" : "transparent",
        border: "2px solid",
        borderColor: error ? "#DC2626" : "#1A1A1A",
        transition: "background 0.1s",
      }}
    />
  ));

  return (
    <div style={{
      minHeight: "100dvh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "var(--bg)", padding: "24px",
    }}>
      {/* Logo / wordmark */}
      <div style={{ marginBottom: 48, textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.12em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
          The Black Bean
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>Branch Inventory</div>
      </div>

      {/* Branch selector */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 40,
        background: "#E8E8E4", borderRadius: 12, padding: 4,
      }}>
        {BRANCHES.map(b => (
          <button
            key={b}
            onClick={() => { setBranch(b); setPin(""); setError(false); }}
            style={{
              padding: "8px 24px", borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 14,
              background: branch === b ? "#FFFFFF" : "transparent",
              color: branch === b ? "#1A1A1A" : "var(--text-secondary)",
              boxShadow: branch === b ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
              transition: "all 0.15s",
            }}
          >
            {BRANCH_LABELS[b]}
          </button>
        ))}
      </div>

      {/* PIN dots */}
      <div style={{
        display: "flex", gap: 16, marginBottom: 40,
        animation: shake ? "shake 0.4s ease" : "none",
      }}>
        {dots}
      </div>

      {error && (
        <div style={{ color: "#DC2626", fontSize: 13, fontWeight: 500, marginBottom: 16, marginTop: -28 }}>
          Wrong PIN. Try again.
        </div>
      )}

      {/* Numpad */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
        width: "100%", maxWidth: 280,
      }}>
        {["1","2","3","4","5","6","7","8","9"].map(d => (
          <PadButton key={d} label={d} onTap={() => tap(d)} />
        ))}
        <div />
        <PadButton label="0" onTap={() => tap("0")} />
        <PadButton label="⌫" onTap={del} muted />
      </div>

      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)}
          60%{transform:translateX(-6px)}
          80%{transform:translateX(6px)}
        }
      `}</style>
    </div>
  );
}

function PadButton({ label, onTap, muted }: { label: string; onTap: () => void; muted?: boolean }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); onTap(); }}
      onPointerLeave={() => setPressed(false)}
      style={{
        height: 64, borderRadius: 16, border: "none", cursor: "pointer",
        fontSize: muted ? 20 : 22, fontWeight: 600,
        background: pressed ? "#E0E0DC" : "#FFFFFF",
        color: muted ? "var(--text-secondary)" : "#1A1A1A",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        transition: "background 0.08s",
        userSelect: "none",
      }}
    >
      {label}
    </button>
  );
}
