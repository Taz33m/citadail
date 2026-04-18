'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  createSessionId,
  queuePendingShellSessionSeed,
} from "@/lib/session-storage";

export default function ShellEntry() {
  const router = useRouter();

  useEffect(() => {
    const sessionId = createSessionId();
    queuePendingShellSessionSeed({
      id: sessionId,
      title: "Citadail",
    });
    router.replace(`/sessions/${sessionId}`);
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
      Opening shell workspace...
    </div>
  );
}
