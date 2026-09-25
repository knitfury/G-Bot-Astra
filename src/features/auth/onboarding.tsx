"use client";
import { ProductionOnboarding } from "./production-onboarding";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ArrowRight, ArrowLeft } from "@phosphor-icons/react";
import { useAction, useSnapshot } from "@/hooks/use-services";
import { services } from "@/services";
import { PLAN_LIMITS } from "@/lib/entitlements";
import type { Plan } from "@/types/domain";
import { ProviderManager } from "@/features/providers/provider-manager";
import { ConnectionManager } from "@/features/connections/connection-manager";
import { Button } from "@/components/ui/button";
import { Logo, Badge, Loading } from "@/components/common/ui";
export function Onboarding() {
  const [step, setStep] = useState(0);
  const { data } = useSnapshot(),
    action = useAction(),
    router = useRouter();
  if (!data) return <Loading />;
  if (data.runtime?.production) return <ProductionOnboarding />;
  return (
    <div className="onboarding">
      <div className="row between">
        <div className="row">
          <Logo small />
          <strong>Your workspace, made yours.</strong>
        </div>
        <Badge>Setup {step + 1} of 3</Badge>
      </div>
      <div className="onboarding-progress">
        {["Choose a plan", "Connect your AI", "Connect your apps"].map(
          (label, i) => (
            <button
              key={label}
              onClick={() => setStep(i)}
              className={i === step ? "active" : ""}
            >
              <span>{i < step ? <Check size={14} /> : i + 1}</span>
              {label}
            </button>
          ),
        )}
      </div>
      <div className="onboarding-content">
        {step === 0 ? (
          <div className="stack">
            <span className="eyebrow">START WITH WHAT YOU NEED</span>
            <h1>Space for your business to grow.</h1>
            <p>
              Every plan includes G-Bot, your choice of AI provider, and
              approval controls. Only the active app allowance changes.
            </p>
            <div className="plan-grid">
              {(Object.keys(PLAN_LIMITS) as Plan[]).map((plan) => (
                <button
                  key={plan}
                  disabled={action.isPending}
                  className={`plan-card ${data.entitlement.plan === plan ? "selected" : ""}`}
                  onClick={() =>
                    void action.mutateAsync(() =>
                      services.entitlements.change(plan),
                    )
                  }
                >
                  <span className="eyebrow">{plan}</span>
                  <strong>
                    {PLAN_LIMITS[plan]}
                    <small>active app{PLAN_LIMITS[plan] > 1 ? "s" : ""}</small>
                  </strong>
                  <p>
                    {plan === "free"
                      ? "A focused start."
                      : plan === "starter"
                        ? "Your everyday toolkit."
                        : "Your business, connected."}
                  </p>
                  <Badge
                    tone={data.entitlement.plan === plan ? "accent" : "neutral"}
                  >
                    {data.entitlement.plan === plan
                      ? "Selected"
                      : "Choose demo plan"}
                  </Badge>
                </button>
              ))}
            </div>
            <p className="tiny">
              Plan selection is a simulation. No payment details or charges.
            </p>
          </div>
        ) : step === 1 ? (
          <ProviderManager embedded />
        ) : (
          <ConnectionManager embedded />
        )}
      </div>
      <div className="onboarding-actions">
        <Button
          variant="ghost"
          onClick={() => (step ? setStep(step - 1) : router.push("/"))}
        >
          <ArrowLeft size={15} />
          Back
        </Button>
        <div className="row">
          {step > 0 && (
            <Button
              variant="ghost"
              onClick={() =>
                step === 2 ? router.push("/workspace") : setStep(step + 1)
              }
            >
              Skip for now
            </Button>
          )}
          <Button
            variant="default"
            onClick={() =>
              step === 2 ? router.push("/workspace") : setStep(step + 1)
            }
          >
            {step === 2 ? "Enter workspace" : "Continue"}
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
