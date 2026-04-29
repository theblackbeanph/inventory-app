"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";

export default function Root() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getSession() ? "/stock" : "/login");
  }, [router]);
  return null;
}
