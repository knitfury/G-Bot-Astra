"use client";
import { useEffect } from "react";
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("G-Bot render error");
  }, [error]);
  return (
    <main className="page">
      <h1>Let’s try that again.</h1>
      <p style={{ margin: "20px 0" }}>
        The screen could not load. Your saved workspace is still on this device.
      </p>
      <button className="button primary" onClick={reset}>
        Reload screen
      </button>
    </main>
  );
}
