"use client";
import { useRouter } from "next/navigation";
import { useSnapshot, useAction } from "@/hooks/use-services";
import { services } from "@/services";
import { desktopCall } from "@/services/desktop/client";
import { useWorkspace } from "@/stores/workspace";
import { ProviderManager } from "@/features/providers/provider-manager";
import { ConnectionManager } from "@/features/connections/connection-manager";
import { Button } from "@/components/ui/button";
import { Badge, Logo, Notice, ErrorState } from "@/components/common/ui";
const steps = [
  "Privacy & data flow",
  "Choose your path",
  "Connect & test AI",
  "Connect an app",
  "Review permissions",
  "Appearance",
  "Your first task",
];
export function ProductionOnboarding() {
  const { data } = useSnapshot(),
    action = useAction(),
    router = useRouter(),
    state = useWorkspace(),
    step = data?.preferences.onboardingStep ?? 0;
  const go = (n: number) =>
    void action
      .mutateAsync(() => services.account.preferences({ onboardingStep: n }))
      .catch(() => {});
  return (
    <main className="onboarding">
      <div className="row between">
        <Logo />
        <Badge>
          Setup {step + 1} of {steps.length}
        </Badge>
      </div>
      <div className="onboarding-progress">
        {steps.map((label, i) => (
          <button
            key={label}
            className={step === i ? "active" : ""}
            onClick={() => go(i)}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>
      <section className="onboarding-content stack">
        <h1>{steps[step]}</h1>
        {step === 0 ? (
          <>
            <p>
              Your device connects directly to your selected AI provider and
              authorized business apps.
            </p>
            <Notice>
              G-Bot cloud receives only account, billing, device and licensing
              metadata. Selected conversation context and attachments are
              processed by your chosen providers under their terms.
            </Notice>
            <p>
              Your local history is encrypted. Review tool permissions and
              approve each consequential action before it runs.
            </p>
          </>
        ) : step === 1 ? (
          <>
            <p>
              Explore a separate simulated workspace, or connect your own AI to
              work with real apps.
            </p>
            <Button onClick={() => void desktopCall("desktop.openDemo")}>
              Explore Demo Mode
            </Button>
            <Button onClick={() => go(2)}>Connect my AI</Button>
          </>
        ) : step === 2 ? (
          <ProviderManager embedded />
        ) : step === 3 ? (
          <ConnectionManager embedded />
        ) : step === 4 ? (
          <>
            <p>
              Tool discovery does not enable access. Choose the read tools you
              need and review consequential tools before enabling them.
            </p>
            {data?.connections.map((c) => (
              <Button
                key={c.id}
                onClick={() => router.push(`/connections/${c.id}`)}
              >
                {c.name} · Tools & Permissions
              </Button>
            ))}
            <Notice>
              Enabling a write tool never approves a specific action. G-Bot
              still asks before sending, changing, deleting or purchasing.
            </Notice>
          </>
        ) : step === 5 ? (
          <>
            <label className="field">
              Color
              <select
                value={state.color}
                onChange={(e) =>
                  state.setColor(e.target.value as typeof state.color)
                }
              >
                {["orange", "purple", "blue", "green", "neutral"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Appearance
              <select
                value={state.appearance}
                onChange={(e) =>
                  state.setAppearance(e.target.value as typeof state.appearance)
                }
              >
                <option>light</option>
                <option>dark</option>
              </select>
            </label>
          </>
        ) : (
          <>
            <p>
              Try asking G-Bot to summarize recent information from your
              connected apps, or select a record in a business pane and ask
              about it.
            </p>
            <Button
              onClick={() => {
                state.setDraft(
                  state.conversationId,
                  "Summarize recent information from my connected apps using the read tools I have enabled.",
                );
                router.push("/workspace");
              }}
            >
              Start with a summary
            </Button>
          </>
        )}
        {action.error && <ErrorState message={action.error.message} />}
      </section>
      <div className="onboarding-actions">
        <Button disabled={step === 0} onClick={() => go(step - 1)}>
          Back
        </Button>
        <Button onClick={() => router.push("/workspace")}>Finish later</Button>
        <Button
          variant="default"
          disabled={action.isPending}
          onClick={() =>
            step === 6 ? router.push("/workspace") : go(step + 1)
          }
        >
          {step === 6 ? "Enter workspace" : "Continue"}
        </Button>
      </div>
    </main>
  );
}
