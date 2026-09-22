import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...values: ClassValue[]) => twMerge(clsx(values));
export const stamp = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export const time = (date: string) =>
  new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
