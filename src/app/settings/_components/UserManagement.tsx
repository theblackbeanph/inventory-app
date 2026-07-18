// src/app/settings/_components/UserManagement.tsx
"use client";
import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db, auth, COLS } from "@/lib/firebase";
import type { UserDoc } from "@/lib/types";
import AddUserSheet from "./AddUserSheet";
import EditUserSheet from "./EditUserSheet";

type UserRow = UserDoc & { uid: string };

const BADGE: Record<string, { bg: string; color: string }> = {
  linecook:   { bg: "#F3F4F6", color: "#6B7280" },
  admin:      { bg: "#EFF6FF", color: "#2563EB" },
  supervisor: { bg: "#F5F3FF", color: "#7C3AED" },
  superadmin: { bg: "#1A1A1A", color: "#FFFFFF" },
};

const BRANCH_LABEL: Record<string, string> = { MKT: "Makati", BF: "BF Homes", both: "Both" };
const DEPT_LABEL:   Record<string, string> = { kitchen: "Kitchen", bar: "Bar", cafe: "Cafe", dining: "Dining", all: "All" };

export default function UserManagement() {
  const [users, setUsers]           = useState<UserRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [showAdd, setShowAdd]       = useState(false);
  const [editing, setEditing]       = useState<UserRow | null>(null);

  useEffect(() => {
    async function load() {
      try {
        await auth.authStateReady();
        const snap = await getDocs(collection(db, COLS.users));
        const rows: UserRow[] = snap.docs.map(d => ({ uid: d.id, ...(d.data() as UserDoc) }));
        rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
        setUsers(rows);
      } catch {
        setLoadError("Failed to load users. Please refresh and try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleCreated(uid: string, userDoc: UserDoc & { uid: string }) {
    setUsers(prev => [...prev, userDoc].sort((a, b) => a.displayName.localeCompare(b.displayName)));
    setShowAdd(false);
  }

  function handleUpdated(uid: string, userDoc: UserDoc) {
    setUsers(prev => prev.map(u => u.uid === uid ? { uid, ...userDoc } : u));
    setEditing(null);
  }

  function handleDeleted(uid: string) {
    setUsers(prev => prev.filter(u => u.uid !== uid));
    setEditing(null);
  }

  if (loading) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center", color: "#DC2626", fontSize: 14 }}>
        {loadError}
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      {users.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
          No users yet.
        </div>
      ) : (
        users.map((user, i) => {
          const badge = BADGE[user.role] ?? BADGE.linecook;
          return (
            <button
              key={user.uid}
              onClick={() => setEditing(user)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "12px 16px", textAlign: "left",
                background: i % 2 === 0 ? "#FFFFFF" : "var(--bg)",
                borderBottom: "1px solid var(--border)", border: "none", cursor: "pointer",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{user.displayName}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {BRANCH_LABEL[user.branch] ?? user.branch} · {DEPT_LABEL[user.department] ?? user.department}
                </div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                background: badge.bg, color: badge.color, textTransform: "uppercase",
                letterSpacing: "0.05em", flexShrink: 0, marginLeft: 12,
              }}>
                {user.role}
              </span>
            </button>
          );
        })
      )}

      {/* Add User footer button */}
      <div style={{
        position: "sticky", bottom: "var(--nav-h)",
        background: "#FFFFFF", borderTop: "1px solid var(--border)",
        padding: "12px 16px",
      }}>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
            background: "#1A1A1A", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
          }}
        >
          + Add User
        </button>
      </div>

      {showAdd && (
        <AddUserSheet onClose={() => setShowAdd(false)} onCreated={handleCreated} />
      )}
      {editing && (
        <EditUserSheet
          user={editing}
          onClose={() => setEditing(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
