"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PullOutRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/transfers"); }, [router]);
  return null;
}
