"use client";
import { useEffect, useState } from "react";
import { isDesktop } from "@/services/desktop/client";
export function useDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => setDesktop(isDesktop()), []);
  return desktop;
}
