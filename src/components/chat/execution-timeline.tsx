"use client";
import {
  CheckCircle,
  CircleNotch,
  WarningCircle,
  CaretDown,
  XCircle,
  Clock,
} from "@phosphor-icons/react";
import type { ToolCall } from "@/types/domain";
import { StatusBadge } from "@/components/common/ui";
export function ExecutionTimeline({ tools }: { tools: ToolCall[] }) {
  if (!tools.length) return null;
  return (
    <div className="execution-timeline" aria-label="Tool execution timeline">
      <span className="eyebrow">WORKING ACROSS YOUR APPS</span>
      {tools.map((t) => (
        <details className={`tool-call ${t.status}`} key={t.id}>
          <summary>
            <span className="tool-state-icon">
              {t.status === "completed" ? (
                <CheckCircle size={18} weight="fill" />
              ) : t.status === "running" ? (
                <CircleNotch size={18} className="spin" />
              ) : t.status === "failed" ? (
                <WarningCircle size={18} />
              ) : t.status === "cancelled" ? (
                <XCircle size={18} />
              ) : (
                <Clock size={18} />
              )}
            </span>
            <span className="grow">
              <strong>{t.input}</strong>
              <span>{t.label}</span>
            </span>
            <StatusBadge status={t.status} />
            <CaretDown size={12} />
          </summary>
          <div className="tool-detail">
            <p>{t.output || t.error || "Waiting for the tool result…"}</p>
            <dl>
              <dt>Tool</dt>
              <dd>{t.toolId || "Waiting for connection"}</dd>
              <dt>Started</dt>
              <dd>{new Date(t.startedAt).toLocaleTimeString()}</dd>
              {t.endedAt && (
                <>
                  <dt>Duration</dt>
                  <dd>
                    {Math.max(
                      0,
                      (Date.parse(t.endedAt) - Date.parse(t.startedAt)) / 1000,
                    ).toFixed(1)}{" "}
                    s
                  </dd>
                </>
              )}
            </dl>
          </div>
        </details>
      ))}
    </div>
  );
}
