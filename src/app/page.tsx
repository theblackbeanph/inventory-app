"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

export default function Root() {
  const router = useRouter();
  useEffect(() => {
    const session = getSession();
    router.replace(session ? "/stock" : "/login");
  }, [router]);
  return null;
}
