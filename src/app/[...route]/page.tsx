import { DemoEntry } from "@/features/auth/demo-entry";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { AuthScreen } from "@/features/auth/auth-screen";
import { Onboarding } from "@/features/auth/onboarding";
import { ProviderManager } from "@/features/providers/provider-manager";
import {
  ConnectionManager,
  ConnectionDetail,
} from "@/features/connections/connection-manager";
import { AccountScreen } from "@/features/account/account-screen";
import { ActivityScreen } from "@/features/activity/activity-screen";
import { SettingsScreen } from "@/features/settings/settings-screen";
export default async function Page({
  params,
}: {
  params: Promise<{ route: string[] }>;
}) {
  const { route } = await params;
  const path = route.join("/");
  if (path === "login" || path === "signup") return <AuthScreen mode={path} />;
  if (path === "demo") return <DemoEntry />;
  if (path === "onboarding") return <Onboarding />;
  let screen: React.ReactNode;
  if (path === "workspace") screen = <WorkspaceLayout />;
  else if (path === "connections") screen = <ConnectionManager />;
  else if (route[0] === "connections" && route.length === 2)
    screen = <ConnectionDetail id={route[1]} />;
  else if (path === "providers") screen = <ProviderManager />;
  else if (path === "activity") screen = <ActivityScreen />;
  else if (path === "account") screen = <AccountScreen />;
  else if (path === "settings") screen = <SettingsScreen />;
  else notFound();
  return <AppShell>{screen}</AppShell>;
}
