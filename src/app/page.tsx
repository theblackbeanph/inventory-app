"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBranchSession, getSession } from "@/lib/auth";

export default function Root() {
  const router = useRouter();
  useEffect(() => {
    const branchSession = getBranchSession();
    if (!branchSession) { router.replace("/login"); return; }
    const session = getSession();
    router.replace(session ? "/stock" : "/department");
  }, [router]);
  return null;
}
