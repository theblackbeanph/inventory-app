"use client";
import type { DailyClose } from "@/lib/types";

export function StocktakeCompleted({ dayClose }: { dayClose: DailyClose }) {
  const rows = Object.entries(dayClose.items).sort(([a], [b]) => a.localeCompare(b));
  const closedTime = new Date(dayClose.closedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{ margin: "12px 16px", background: "#F0FDF4", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#15803D" }}>Count Confirmed ✓</div>
        <div style={{ fontSize: 12, color: "#16A34A", marginTop: 2 }}>
          {dayClose.countType === "manual" ? `${dayClose.closedBy} · ${closedTime}` : "Auto-closed by system"}
        </div>
      </div>

      <div>
        {rows.map(([item, data]) => {
          const varColor = data.variance === 0 ? "#16A34A" : data.variance > 0 ? "#D97706" : "#DC2626";
          return (
            <div key={item} style={{ background: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>Expected: {data.expected} · BEG: {data.beginning}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{data.endCount}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: varColor }}>
                  {data.variance > 0 ? `+${data.variance}` : data.variance === 0 ? "✓" : String(data.variance)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
