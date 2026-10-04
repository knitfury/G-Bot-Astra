"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export function DesktopReturn() {
  const [native, setNative] = useState(false);
  useEffect(() => setNative(!!window.gbot || !!window.gbotDemo), []);
  return native ? (
    <Link href="/workspace" aria-label="Back to workspace">
      ← Back to workspace
    </Link>
  ) : (
    <Link href="/portal">My account</Link>
  );
}
