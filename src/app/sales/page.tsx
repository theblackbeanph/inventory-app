"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession, BRANCH_LABELS } from "@/lib/auth";
import { hasMinRole } from "@/lib/roles";
import { businessDatePHT } from "@/app/stock/_lib/helpers";
import { combineDashboards, type DashboardData } from "@/app/sales/_lib/combine";
import BottomNav from "@/components/BottomNav";
import type { Branch } from "@/lib/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt  = (n: number) => `₱${n.toLocaleString("en-PH")}`;
const fmtK = (n: number) => n >= 1000 ? `₱${(n / 1000).toFixed(1)}k` : `₱${n}`;
const hourLabel = (h: number) => h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;

function prevDay(d: string): string {
  const date = new Date(d + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// ─── Hourly SVG chart ─────────────────────────────────────────────────────────

function HourlyChart({ data }: { data: { hour: number; revenue: number }[] }) {
  if (data.length < 2) return null;

  const W = 560, H = 110;
  const pad = { top: 6, right: 4, bottom: 18, left: 40 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const maxRev = Math.max(...data.map(d => d.revenue), 1);
  const xs = data.map((_, i) => pad.left + (i / (data.length - 1)) * innerW);
  const ys = data.map(d => pad.top + (1 - d.revenue / maxRev) * innerH);

  const linePath = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${xs[xs.length - 1].toFixed(1)},${(H - pad.bottom).toFixed(1)} L${xs[0].toFixed(1)},${(H - pad.bottom).toFixed(1)} Z`;

  const yTicks = [0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} aria-hidden>
      <defs>
        <linearGradient id="tbbGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#C8A96E" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#C8A96E" stopOpacity="0"    />
        </linearGradient>
      </defs>

      {/* Grid */}
      {yTicks.map(f => {
        const y = pad.top + (1 - f) * innerH;
        return <line key={f} x1={pad.left} y1={y} x2={W - pad.right} y2={y} stroke="#E8E8E4" strokeWidth={1} />;
      })}

      {/* Y labels */}
      {[0, 0.5, 1].map(f => {
        const y = pad.top + (1 - f) * innerH;
        return (
          <text key={f} x={pad.left - 5} y={y + 3.5} textAnchor="end" fontSize={8} fill="#9CA3AF">
            {fmtK(Math.round(maxRev * f))}
          </text>
        );
      })}

      {/* Area + line */}
      <path d={areaPath} fill="url(#tbbGrad)" />
      <path d={linePath} fill="none" stroke="#C8A96E" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* X labels — every 2 hours */}
      {data.map((d, i) =>
        i % 2 === 0 ? (
          <text key={d.hour} x={xs[i].toFixed(1)} y={H - 3} textAnchor="middle" fontSize={8} fill="#9CA3AF">
            {hourLabel(d.hour)}
          </text>
        ) : null
      )}
    </svg>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent = false,
}: {
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div style={{
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: "14px 16px",
      borderLeft: accent ? "3px solid #C8A96E" : undefined,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: sub ? 2 : 0 }}>{value}</div>
      {sub && <div style={{ fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type View = "ALL" | Branch;
const BRANCHES: Branch[] = ["MKT", "BF"];

export default function SalesPage() {
  const router = useRouter();
  const [authed, setAuthed]   = useState(false);
  const [view, setView]       = useState<View>("ALL");
  const [date, setDate]       = useState<string>(businessDatePHT());
  const [cache, setCache]     = useState<Record<string, DashboardData | null>>({});
  const [loading, setLoading] = useState(false);

  // Auth guard
  useEffect(() => {
    const session = getSession();
    if (!session) { router.replace("/login"); return; }
    if (!hasMinRole(session.role, "superadmin")) { router.replace("/stock"); return; }
    setAuthed(true);
  }, [router]);

  // Fetch every (branch, date) pair the current view needs, skipping cached keys
  useEffect(() => {
    if (!authed) return;
    const branches = view === "ALL" ? BRANCHES : [view];
    const prevDate = prevDay(date);
    const needed = branches.flatMap(b => [`${b}__${date}`, `${b}__${prevDate}`])
      .filter(k => !(k in cache));
    if (needed.length === 0) return;

    setLoading(true);
    Promise.all(
      needed.map(async key => {
        const [b, d] = key.split("__");
        try {
          const r = await fetch(`/api/storehub/dashboard?branch=${b}&date=${d}`);
          const j = await r.json();
          return [key, j?.error ? null : (j as DashboardData)] as const;
        } catch {
          return [key, null] as const;
        }
      })
    )
      .then(entries => setCache(c => ({ ...c, ...Object.fromEntries(entries) })))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, view, date]);

  if (!authed) return null;

  const prevDate = prevDay(date);
  const get = (b: Branch, d: string) => cache[`${b}__${d}`] ?? null;

  const todayMKT = get("MKT", date), todayBF = get("BF", date);
  const prevMKT  = get("MKT", prevDate), prevBF = get("BF", prevDate);

  let data: DashboardData | null = null;
  let prev: DashboardData | null = null;
  let partialNotice: string | null = null;

  if (view === "ALL") {
    if (todayMKT && todayBF) data = combineDashboards(todayMKT, todayBF);
    else if (todayMKT || todayBF) {
      data = todayMKT ?? todayBF;
      const missing = todayMKT ? "BF" : "MKT";
      const shown   = todayMKT ? "MKT" : "BF";
      partialNotice = `${missing} data unavailable — totals show ${shown} only`;
    }
    prev = prevMKT && prevBF ? combineDashboards(prevMKT, prevBF) : null;
  } else {
    data = get(view, date);
    prev = get(view, prevDate);
  }

  const delta = data && prev
    ? ((data.revenue - prev.revenue) / (prev.revenue || 1)) * 100
    : null;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", paddingBottom: "calc(var(--nav-h) + 16px)" }}>

      {/* Header */}
      <div style={{
        background: "#FFFFFF", borderBottom: "1px solid var(--border)",
        padding: "16px 16px 14px", position: "sticky", top: 0, zIndex: 40,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
              {view === "ALL" ? "The Black Bean · POS" : `${BRANCH_LABELS[view]} · POS`}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Sales</div>
          </div>
          <input
            type="date"
            value={date}
            max={businessDatePHT()}
            onChange={e => { if (e.target.value) setDate(e.target.value); }}
            style={{
              background: "var(--bg)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "6px 10px", fontSize: 12,
              color: "var(--text-secondary)", fontFamily: "inherit",
              outline: "none", cursor: "pointer",
            }}
          />
        </div>

        {/* Pills */}
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {(["ALL", ...BRANCHES] as View[]).map(v => {
            const active = view === v;
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  borderRadius: 999, padding: "5px 14px", fontSize: 12, cursor: "pointer",
                  fontWeight: active ? 600 : 400,
                  background: active ? "#1A1A1A" : "#FFFFFF",
                  color: active ? "#FFFFFF" : "var(--text-secondary)",
                  border: active ? "1px solid #1A1A1A" : "1px solid var(--border)",
                }}
              >
                {v === "ALL" ? "Both" : v}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: "14px 14px 0" }}>

        {/* Loading */}
        {loading && !data && (
          <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-secondary)", fontSize: 13 }}>
            Loading…
          </div>
        )}

        {data && (
          <>
            {/* Partial-failure notice */}
            {partialNotice && (
              <div style={{
                background: "#FFFBEB", border: "1px solid #FDE68A",
                borderRadius: 10, padding: "10px 14px", marginBottom: 12,
                fontSize: 13, color: "#B45309",
              }}>
                {partialNotice}
              </div>
            )}

            {/* Revenue card */}
            <div style={{ marginBottom: 10 }}>
              <StatCard
                label="Revenue"
                value={fmt(data.revenue)}
                accent
                sub={
                  <>
                    {delta !== null ? (
                      <span style={{ color: delta >= 0 ? "var(--good)" : "var(--critical)", fontWeight: 500 }}>
                        {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% vs prev day
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-secondary)" }}>no prev-day data</span>
                    )}
                    {view === "ALL" && todayMKT && todayBF && (
                      <div style={{ color: "var(--text-secondary)", marginTop: 2 }}>
                        MKT {fmt(todayMKT.revenue)} · BF {fmt(todayBF.revenue)}
                      </div>
                    )}
                  </>
                }
              />
            </div>

            {/* Tx + AOV */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <StatCard
                label="Transactions"
                value={data.txCount}
                sub={
                  view === "ALL" && todayMKT && todayBF
                    ? <span style={{ color: "var(--text-secondary)" }}>MKT {todayMKT.txCount} · BF {todayBF.txCount}</span>
                    : <span style={{ color: "var(--text-secondary)" }}>orders today</span>
                }
              />
              <StatCard label="Avg Order" value={fmt(data.aov)} sub={<span style={{ color: "var(--text-secondary)" }}>per transaction</span>} />
            </div>

            {/* Hourly chart */}
            <div style={{
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 12, padding: "14px 14px 10px", marginBottom: 12,
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 10 }}>
                {view === "ALL" ? "Hourly Sales — Combined" : "Hourly Sales"}
              </div>
              <HourlyChart data={data.hourly} />
            </div>

            {/* Top Items + Payment Mix */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>

              {/* Top items */}
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 10 }}>
                  {view === "ALL" ? "Top Items — Combined" : "Top Items"}
                </div>
                {data.topItems.map((item, i) => {
                  const maxQty = data.topItems[0]?.qty || 1;
                  return (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, gap: 4 }}>
                        <span style={{ fontSize: 11, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                          {item.name}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", flexShrink: 0 }}>
                          {item.qty}
                        </span>
                      </div>
                      <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(item.qty / maxQty) * 100}%`, background: "#C8A96E", borderRadius: 2, transition: "width 0.5s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Payment mix */}
              <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase", marginBottom: 10 }}>
                  {view === "ALL" ? "Payment Mix — Combined" : "Payment Mix"}
                </div>
                {([
                  { label: "Card",  value: data.paymentMix.card  },
                  { label: "GCash", value: data.paymentMix.gcash },
                  { label: "Cash",  value: data.paymentMix.cash  },
                ] as const).map(row => (
                  <div key={row.label} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{row.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{Math.round(row.value * 100)}%</span>
                    </div>
                    <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${row.value * 100}%`, background: "#C8A96E", borderRadius: 3, transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
