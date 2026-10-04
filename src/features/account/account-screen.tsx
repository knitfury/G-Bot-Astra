"use client";
import { PlanComparison } from "@/components/common/plan-comparison";
import { PlanCards } from "@/components/common/plan-cards";
import { desktopCall } from "@/services/desktop/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, SignOut, ShieldCheck } from "@phosphor-icons/react";
import { useAction, useSnapshot } from "@/hooks/use-services";
import { useWorkspace } from "@/stores/workspace";
import { services } from "@/services";
import { PLAN_LIMITS, connectionAvailable } from "@/lib/entitlements";
import type { Plan } from "@/types/domain";
import {
  PageHeading,
  Loading,
  Badge,
  Notice,
  ErrorState,
} from "@/components/common/ui";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
export function AccountScreen() {
  const { data } = useSnapshot(),
    action = useAction(),
    router = useRouter();
  const [plan, setPlan] = useState<Plan>(),
    [name, setName] = useState(""),
    [edit, setEdit] = useState(false),
    [logout, setLogout] = useState(false);
  const select = useWorkspace((s) => s.setConversation);
  if (!data) return <Loading />;
  if (data.runtime?.production)
    return (
      <div className="page">
        <PageHeading
          eyebrow="YOUR ACCOUNT"
          title="Account & plan"
          description="Manage your subscription, devices and security."
        />
        <div className="panel stack">
          <h2>{data.user?.name || "Your account"}</h2>
          <p>{data.user?.email}</p>
          <Badge>
            {data.entitlement.plan} · {data.entitlement.status}
          </Badge>
          <p>
            {data.entitlement.maxActiveConnections} active connections. Saved
            connections are retained when your plan changes.
          </p>
          <p>
            Billing and security open in your browser. Card details never enter
            G-Bot.
          </p>
          <Button
            onClick={() =>
              void action
                .mutateAsync(() => desktopCall("desktop.openAccount"))
                .catch(() => {})
            }
          >
            Manage account & billing
          </Button>
          <Button
            onClick={() =>
              void action
                .mutateAsync(() => desktopCall("desktop.refreshLicense"))
                .catch(() => {})
            }
          >
            Refresh device access
          </Button>
          <Button
            onClick={() =>
              void action
                .mutateAsync(async () => {
                  await services.auth.logout();
                  router.push("/");
                })
                .catch(() => {})
            }
          >
            Sign out
          </Button>
          {action.error && <ErrorState message={action.error.message} />}
        </div>
        <PlanCards
          current={data.entitlement.plan}
          status={data.entitlement.status}
          onSelect={() =>
            void action
              .mutateAsync(() => desktopCall("desktop.openAccount"))
              .catch(() => {})
          }
        />
        <PlanComparison />
      </div>
    );
  return (
    <div className="page">
      <PageHeading
        eyebrow="DEMO WORKSPACE"
        title="Account & plan"
        description="Simulate plan changes with fictional data. This does not change your real account or subscription."
      >
        <Badge>Demo account · simulated plan</Badge>
      </PageHeading>
      <div className="panel profile-panel">
        <div className="row">
          <span className="avatar large-avatar">
            {data.user?.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="grow">
            <h2>{data.user?.name}</h2>
            <p>{data.user?.email}</p>
          </div>
          <Button
            onClick={() => {
              setName(data.user?.name || "");
              setEdit(true);
            }}
          >
            Edit profile
          </Button>
        </div>
      </div>
      <div className="plan-overview">
        <div>
          <span className="eyebrow">SIMULATED PLAN</span>
          <h2 className="capitalize">
            {data.entitlement.plan}
            <Badge
              tone={
                data.entitlement.status === "active" ? "success" : "warning"
              }
            >
              {data.entitlement.status}
            </Badge>
          </h2>
          <p>
            {
              data.connections.filter((c) =>
                connectionAvailable(data.entitlement, c),
              ).length
            }{" "}
            active · {data.connections.length} saved ·{" "}
            {data.entitlement.maxActiveConnections} allowed
          </p>
        </div>
        <div>
          <span className="eyebrow">SIMULATED RENEWAL</span>
          <p>
            {data.entitlement.plan === "free"
              ? "No renewal required"
              : `${data.entitlement.renewalAt} · Simulated`}
          </p>
          <span className="tiny muted">No payment method. No charges.</span>
        </div>
        {data.entitlement.status === "expired" && (
          <Button
            onClick={() =>
              void action.mutateAsync(() => services.entitlements.expire(false))
            }
          >
            Restore demo entitlement
          </Button>
        )}
      </div>
      <PlanCards
        current={data.entitlement.plan}
        status={data.entitlement.status}
        demo
        onSelect={setPlan}
      />
      <PlanComparison />
      <Notice>
        Downgrading keeps every saved connection. Excess active connections
        become inactive. Reconnect them when capacity is available.
      </Notice>
      <div className="settings-row">
        <div>
          <h3>Sign out securely</h3>
          <p>
            Clears Demo connection settings and disconnects the fictional apps.
            Configuration and history remain in this browser.
          </p>
        </div>
        <Button onClick={() => setLogout(true)}>
          <SignOut size={17} />
          Sign out
        </Button>
      </div>
      {action.error && <ErrorState message={action.error.message} />}
      <Dialog
        open={!!plan}
        onOpenChange={() => setPlan(undefined)}
        title={`Switch to ${plan}?`}
        description="This is a simulated plan change. No payment is taken."
      >
        <p className="confirm-text">
          {plan && PLAN_LIMITS[plan] < data.entitlement.maxActiveConnections
            ? `Excess active connections will become inactive. Their configuration and permissions will remain saved.`
            : `Your workspace will allow ${plan ? PLAN_LIMITS[plan] : 0} active connections.`}
        </p>
        <div className="form-actions">
          <Button onClick={() => setPlan(undefined)}>Keep current plan</Button>
          <Button
            variant="default"
            disabled={action.isPending}
            onClick={() =>
              void action
                .mutateAsync(() => services.entitlements.change(plan!))
                .then(() => setPlan(undefined))
            }
          >
            Confirm demo plan
          </Button>
        </div>
      </Dialog>
      <Dialog open={edit} onOpenChange={setEdit} title="Edit profile">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void action
              .mutateAsync(() => services.account.update(name))
              .then(() => setEdit(false));
          }}
        >
          <label className="field">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </label>
          <Button variant="default" type="submit">
            Save profile
          </Button>
        </form>
      </Dialog>
      <Dialog
        open={logout}
        onOpenChange={setLogout}
        title="Sign out of G-Bot?"
        description="Mock credentials will be cleared. Saved configuration and history stay in this browser."
      >
        <div className="form-actions">
          <Button onClick={() => setLogout(false)}>Stay signed in</Button>
          <Button
            variant="destructive"
            onClick={() =>
              void action
                .mutateAsync(() => services.auth.logout())
                .then(() => {
                  select("");
                  router.push("/");
                })
            }
          >
            Sign out & clear credentials
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
