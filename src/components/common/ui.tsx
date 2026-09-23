"use client";
import { useDesktop } from "@/hooks/use-desktop";
import {
  CircleNotch,
  WarningCircle,
  CheckCircle,
  EnvelopeSimple,
  Users,
  Package,
  Receipt,
  Headset,
  CalendarBlank,
  Files,
  Kanban,
  Sparkle,
  ArrowRight,
  Plugs,
  Lock,
} from "@phosphor-icons/react";
import type { Category } from "@/types/domain";
import { Button } from "@/components/ui/button";
import Link from "next/link";
export const categoryIcons = {
  Email: EnvelopeSimple,
  CRM: Users,
  Inventory: Package,
  Accounting: Receipt,
  Helpdesk: Headset,
  Calendar: CalendarBlank,
  Documents: Files,
  Projects: Kanban,
};
export function AppIcon({
  category,
  size = 22,
}: {
  category: Category;
  size?: number;
}) {
  const Icon = categoryIcons[category];
  return (
    <span className={`app-icon app-${category.toLowerCase()}`}>
      <Icon size={size} weight="duotone" />
    </span>
  );
}
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? "small" : ""}`}>
      <Sparkle weight="fill" size={small ? 20 : 28} />
    </span>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "error" | "accent";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      tone={
        /connected|completed|approved|ready|active/i.test(status) &&
        !status.includes("disconnected")
          ? "success"
          : /failed|error|expired/i.test(status)
            ? "error"
            : /locked|pending|approval|authentication/i.test(status)
              ? "warning"
              : "neutral"
      }
    >
      {status}
    </Badge>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <WarningCircle size={21} />
      <span>{message}</span>
      {retry && (
        <Button size="sm" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  );
}
export function Loading({
  label = "Loading your workspace…",
}: {
  label?: string;
}) {
  return (
    <div className="loading" role="status">
      <CircleNotch size={22} className="spin" />
      {label}
    </div>
  );
}
export function Empty({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="empty-state">
      <Plugs size={32} weight="duotone" />
      <h3>{title}</h3>
      <p>{description}</p>
      {href && (
        <Button asChild>
          <Link href={href}>
            {action || "Get started"}
            <ArrowRight size={16} />
          </Link>
        </Button>
      )}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div>{children}</div>
    </header>
  );
}
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="notice">
      <CheckCircle size={19} />
      <span>{children}</span>
    </div>
  );
}
export function MockNote() {
  const desktop = useDesktop();
  return (
    <span className="mock-note">
      <Lock size={12} />{" "}
      {desktop
        ? "Local workspace · live integrations"
        : "Demo environment · no live actions"}
    </span>
  );
}
