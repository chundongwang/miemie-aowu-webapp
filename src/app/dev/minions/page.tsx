"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import CursorMinionsModal from "@/components/CursorMinionsModal";
function Inner() {
  const sp = useSearchParams();
  const ff = Number(sp.get("ff") ?? 0);
  // Headless screenshot tooling resizes the window after first paint; mount late so the fast-forward survives it.
  const [ready, setReady] = useState(ff === 0);
  useEffect(() => {
    if (ff === 0) return;
    const id = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(id);
  }, [ff]);
  if (!ready) return null;
  return <CursorMinionsModal onClose={() => {}} closeLabel="close" hint="hint" doneHint="done" fastForwardMs={ff} />;
}
export default function Page() {
  return <Suspense><Inner /></Suspense>;
}
