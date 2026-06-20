"use client";
import { useEffect, useRef, useState } from "react";
import { db, auth } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { CATALOG } from "@/lib/items";
import { todayPHT } from "@/app/stock/_lib/helpers";
import type { Branch, ParLevelItem } from "@/lib/types";

interface Props {
  branch: Branch;
  updatedBy: string;
}

type DraftMap = Record<string, { parLevel: string; alertAt: string }>;

const COMMISSARY_PC_ITEMS = CATALOG.filter(i => i.commissary && i.unit === "pc");

export default function ParLevelSettings({ branch, updatedBy }: Props) {
  const [draft, setDraft] = useState<DraftMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const originalRef = useRef<DraftMap>({});

  useEffect(() => {
    async function load() {
      try {
        await auth.authStateReady();
        const snap = await getDoc(doc(db, "parLevelSettings", branch));
        const firestoreItems: Record<string, ParLevelItem> = snap.exists() ? snap.data().items ?? {} : {};

        const initial: DraftMap = {};
        for (const item of COMMISSARY_PC_ITEMS) {
          const override = firestoreItems[item.name];
          initial[item.name] = {
            parLevel: String(override?.parLevel ?? item.parLevel ?? item.reorderAt),
            alertAt:  String(override?.alertAt  ?? item.reorderAt),
          };
        }
        originalRef.current = initial;
        setDraft(initial);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [branch]);

  function handleChange(name: string, field: "parLevel" | "alertAt", value: string) {
    setDraft(prev => ({ ...prev, [name]: { ...prev[name], [field]: value } }));
    setDirty(true);
    setSavedAt(null);
  }

  async function handleSave() {
    setSaving(true);
    const items: Record<string, ParLevelItem> = {};
    for (const item of COMMISSARY_PC_ITEMS) {
      const row = draft[item.name];
      const parLevel = parseInt(row.parLevel, 10);
      const alertAt  = parseInt(row.alertAt,  10);
      if (!isNaN(parLevel) && !isNaN(alertAt)) {
        items[item.name] = { parLevel, alertAt };
      }
    }
    await setDoc(doc(db, "parLevelSettings", branch), {
      branch,
      items,
      updatedAt: new Date().toISOString(),
      updatedBy,
    });
    originalRef.current = { ...draft };
    setDirty(false);
    setSavedAt(todayPHT());
    setSaving(false);
  }

  function handleReset() {
    setDraft({ ...originalRef.current });
    setDirty(false);
  }

  if (loading) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  return (
    <div>
      {/* Column headers */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 80px 80px",
        gap: 8, padding: "8px 16px",
        fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
        color: "var(--text-secondary)", textTransform: "uppercase",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
        position: "sticky", top: 57, zIndex: 10,
      }}>
        <span>Item</span>
        <span style={{ textAlign: "center" }}>Par Level</span>
        <span style={{ textAlign: "center" }}>Low Alert</span>
      </div>

      {/* Item rows */}
      {COMMISSARY_PC_ITEMS.map((item, i) => {
        const row = draft[item.name] ?? { parLevel: "", alertAt: "" };
        const parNum = parseInt(row.parLevel, 10);
        const alertNum = parseInt(row.alertAt, 10);
        const alertExceedsPar = !isNaN(parNum) && !isNaN(alertNum) && alertNum >= parNum;
        return (
          <div key={item.name} style={{
            display: "grid", gridTemplateColumns: "1fr 80px 80px",
            gap: 8, padding: "10px 16px", alignItems: "center",
            borderBottom: "1px solid var(--border)",
            background: i % 2 === 0 ? "#FFFFFF" : "var(--bg)",
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1 }}>
                {item.category}
              </div>
            </div>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={row.parLevel}
              onChange={e => handleChange(item.name, "parLevel", e.target.value)}
              style={{
                width: "100%", padding: "6px 4px", textAlign: "center",
                fontSize: 14, fontWeight: 600,
                border: "1px solid var(--border)", borderRadius: 6,
                background: "#FFFFFF", outline: "none",
                boxSizing: "border-box",
              }}
            />
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={row.alertAt}
              onChange={e => handleChange(item.name, "alertAt", e.target.value)}
              style={{
                width: "100%", padding: "6px 4px", textAlign: "center",
                fontSize: 14, fontWeight: 600,
                border: `1px solid ${alertExceedsPar ? "#EF4444" : "var(--border)"}`,
                borderRadius: 6,
                background: "#FFFFFF", outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        );
      })}

      {/* Footer */}
      <div style={{
        position: "sticky", bottom: "var(--nav-h)",
        background: "#FFFFFF", borderTop: "1px solid var(--border)",
        padding: "12px 16px", display: "flex", gap: 8, alignItems: "center",
      }}>
        {dirty && (
          <button
            onClick={handleReset}
            style={{
              flex: "0 0 auto", padding: "10px 16px",
              fontSize: 14, fontWeight: 600,
              background: "none", border: "1px solid var(--border)",
              borderRadius: 8, cursor: "pointer", color: "var(--text-secondary)",
            }}
          >
            Reset
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          style={{
            flex: 1, padding: "12px 16px",
            fontSize: 15, fontWeight: 700,
            background: dirty ? "#1A1A1A" : "#E5E7EB",
            color: dirty ? "#FFFFFF" : "#9CA3AF",
            border: "none", borderRadius: 8,
            cursor: dirty ? "pointer" : "default",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
        {savedAt && !dirty && (
          <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 600, whiteSpace: "nowrap" }}>
            Saved ✓
          </span>
        )}
      </div>
    </div>
  );
}
