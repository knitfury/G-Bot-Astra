"use client";
import { Check } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/production/model";
import { PLAN_LIMITS } from "@/lib/entitlements";
import type { Plan } from "@/types/domain";
export function PlanCards({
  current,
  status,
  demo = false,
  onSelect,
}: {
  current: Plan;
  status: string;
  demo?: boolean;
  onSelect: (plan: Plan) => void;
}) {
  return (
    <div className="plan-grid">
      {(Object.keys(PLAN_LIMITS) as Plan[]).map((p) => (
        <div className={`plan-card ${current === p ? "selected" : ""}`} key={p}>
          <span className="eyebrow">{p}</span>
          <strong>
            €{PLANS[p].monthly}
            <small>EUR / month · €{PLANS[p].annual} / year</small>
            {PLAN_LIMITS[p]}
            <small>active connection{p === "free" ? "" : "s"}</small>
          </strong>
          <p>
            {p === "free"
              ? "Start with one essential app."
              : p === "starter"
                ? "Connect your everyday toolkit."
                : "Bring the whole business together."}
          </p>
          <ul className="plan-features">
            <li>
              <Check size={14} />
              BYOK direct AI
            </li>
            <li>
              <Check size={14} />
              Dynamic saved connections
            </li>
            <li>
              <Check size={14} />
              Approval controls
            </li>
            <li>
              <Check size={14} />
              All colors with light & dark appearance
            </li>
          </ul>
          <Button
            variant={current === p ? "secondary" : "default"}
            disabled={current === p && status === "active"}
            onClick={() => onSelect(p)}
          >
            {current === p
              ? "Current plan"
              : demo
                ? `Switch to ${p}`
                : `Manage ${p} in billing`}
          </Button>
        </div>
      ))}
    </div>
  );
}
