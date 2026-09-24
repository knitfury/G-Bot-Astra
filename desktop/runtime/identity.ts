import {
  createClient,
  type SupabaseClient,
  type User as AuthUser,
} from "@supabase/supabase-js";
import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { z } from "zod";
import type { SecretVault } from "./storage";
import { DomainError } from "./errors";
import { verifyLicense } from "../../src/production/signed";
import type { License, Signed } from "../../src/production/model";
import type { User } from "../../src/types/domain";
export interface IdentityConfig {
  supabaseUrl: string;
  anonKey: string;
  controlOrigin: string;
  environment: License["environment"];
  publicKeys: Record<string, string>;
  version: string;
  platform: "win32" | "darwin";
}
const cacheSchema = z.object({
  account: z.string().uuid(),
  device: z.string().uuid(),
  sequence: z.number(),
  lastSeen: z.number(),
  signed: z.unknown(),
});
export class ProductionIdentity {
  private client?: SupabaseClient;
  private lastOnline = 0;
  private current?: License;
  private revalidation?: Promise<License>;
  private cancelOAuth?: () => void;
  constructor(
    private vault: SecretVault,
    private config: IdentityConfig,
    private launch: (url: string) => Promise<void>,
    private changed: (license: License | null, user?: User) => Promise<void>,
  ) {}
  private auth() {
    if (this.client) return this.client;
    let url: URL;
    try {
      url = new URL(this.config.supabaseUrl);
    } catch {
      throw new DomainError(
        "CAPABILITY",
        "Account services are not configured yet. Demo Mode remains available.",
      );
    }
    if (url.protocol !== "https:" || !this.config.anonKey)
      throw new DomainError(
        "CAPABILITY",
        "Account services are not configured yet.",
      );
    this.client = createClient(url.href, this.config.anonKey, {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
        storage: {
          getItem: (k) =>
            this.vault.get(`identity:${k}`).then((v) => v ?? null),
          setItem: (k, v) => this.vault.set(`identity:${k}`, v),
          removeItem: (k) => this.vault.delete(`identity:${k}`),
        },
      },
    });
    return this.client;
  }
  private user(u: AuthUser): User {
    return {
      id: u.id,
      email: u.email ?? "",
      name:
        typeof u.user_metadata?.display_name === "string"
          ? u.user_metadata.display_name
          : (u.email?.split("@")[0] ?? "Your account"),
      avatar: "",
      status: "active",
      createdAt: u.created_at,
    };
  }
  async login(email: string, password: string) {
    const { data, error } = await this.auth().auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user)
      throw new DomainError(
        "PROVIDER_AUTH",
        "Sign-in failed. Check your credentials and connection.",
      );
    await this.changed(null, this.user(data.user));
    await this.ensure(true);
    return this.user(data.user);
  }
  async signup(name: string, email: string, password: string) {
    const { data, error } = await this.auth().auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
        emailRedirectTo: `${this.config.controlOrigin}/portal`,
      },
    });
    if (error || !data.user)
      throw new DomainError(
        "PROVIDER_AUTH",
        "Account creation failed. Check your details and retry.",
      );
    if (!data.session)
      throw new DomainError(
        "PROVIDER_AUTH",
        "Check your email to verify your account, then sign in.",
      );
    await this.changed(null, this.user(data.user));
    await this.ensure(true);
    return this.user(data.user);
  }
  async reset(email: string) {
    const { error } = await this.auth().auth.resetPasswordForEmail(email, {
      redirectTo: `${this.config.controlOrigin}/portal?recovery=1`,
    });
    if (error)
      throw new DomainError(
        "NETWORK",
        "Recovery email could not be requested. Retry later.",
      );
  }
  async logout() {
    this.cancelOAuth?.();
    if (this.client) await this.client.auth.signOut({ scope: "local" });
    await this.vault.delete("offline-license");
    this.current = undefined;
    this.lastOnline = 0;
    await this.changed(null);
  }
  async browser(provider: "google" | "azure") {
    this.cancelOAuth?.();
    const state = randomBytes(32).toString("hex");
    let settled = false;
    const code = await new Promise<string>((resolve, reject) => {
      const server = createServer((req, res) => {
        const u = new URL(req.url ?? "/", "http://127.0.0.1:43828");
        const incoming = u.searchParams.get("state") ?? "";
        const valid =
          req.headers.host === "127.0.0.1:43828" &&
          req.method === "GET" &&
          u.pathname === "/account/callback" &&
          incoming.length === state.length &&
          timingSafeEqual(Buffer.from(incoming), Buffer.from(state)) &&
          !settled;
        if (!valid) {
          res.writeHead(400);
          res.end("Invalid callback.");
          return;
        }
        const value = u.searchParams.get("code");
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Cache-Control", "no-store");
        res.end("Return to G-Bot. You may close this window.");
        finish(
          value && value.length < 4096
            ? undefined
            : Error("Authorization cancelled"),
          value ?? undefined,
        );
      });
      const finish = (error?: Error, value?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        server.close();
        this.cancelOAuth = undefined;
        if (error) reject(error);
        else resolve(value!);
      };
      const timer = setTimeout(
        () => finish(Error("Authorization expired. Try again.")),
        120000,
      );
      this.cancelOAuth = () => finish(Error("Authorization cancelled"));
      server.on("error", () =>
        finish(
          Error(
            "Cannot open secure sign-in callback. Close other sign-in attempts.",
          ),
        ),
      );
      server.listen(43828, "127.0.0.1", () => {
        void (async () => {
          const r = await this.auth().auth.signInWithOAuth({
            provider,
            options: {
              redirectTo: `http://127.0.0.1:43828/account/callback?state=${state}`,
              skipBrowserRedirect: true,
              ...(provider === "azure" ? { scopes: "email" } : {}),
            },
          });
          if (r.error || !r.data.url) throw Error();
          await this.launch(r.data.url);
        })().catch(() =>
          finish(Error("Unable to open sign-in. Check your connection.")),
        );
      });
    });
    const { data, error } = await this.auth().auth.exchangeCodeForSession(code);
    if (error || !data.user)
      throw new DomainError("PROVIDER_AUTH", "Sign-in expired. Try again.");
    await this.changed(null, this.user(data.user));
    await this.ensure(true);
    return this.user(data.user);
  }
  async mfa(code: string) {
    const factors = await this.auth().auth.mfa.listFactors();
    const factor = factors.data?.totp.find((f) => f.status === "verified");
    if (!factor)
      throw new DomainError(
        "PROVIDER_AUTH",
        "No verified authenticator is configured.",
      );
    const result = await this.auth().auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });
    if (result.error)
      throw new DomainError(
        "PROVIDER_AUTH",
        "Authenticator code was not accepted.",
      );
    await this.ensure(true);
  }
  async ensure(force = false): Promise<License> {
    if (
      !force &&
      this.current &&
      Date.now() + 60_000 >= this.lastOnline &&
      Date.now() - this.lastOnline < 60_000 &&
      this.current.expiresAt > Date.now()
    )
      return this.current;
    if (this.revalidation) return this.revalidation;
    this.revalidation = this.validate();
    try {
      return await this.revalidation;
    } finally {
      this.revalidation = undefined;
    }
  }
  private async validate(): Promise<License> {
    const raw = await this.vault.get("offline-license");
    const cache = raw ? cacheSchema.parse(JSON.parse(raw)) : undefined;
    let device = await this.vault.get("device-id");
    if (!device) {
      device = randomUUID();
      await this.vault.set("device-id", device);
    }
    try {
      const session = await this.auth().auth.getSession();
      if (session.error?.name === "AuthRetryableFetchError")
        throw new TypeError("Offline");
      if (session.error || !session.data.session)
        throw new DomainError(
          "PROVIDER_AUTH",
          "Sign in to activate this device.",
        );
      const account = session.data.session.user.id;
      const response = await fetch(
        `${this.config.controlOrigin}/api/control/license`,
        {
          method: "POST",
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.data.session.access_token}`,
          },
          body: JSON.stringify({
            id: device,
            name: `${this.config.platform === "win32" ? "Windows" : "Mac"} device`,
            platform: this.config.platform,
            version: this.config.version,
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) {
        if (response.status >= 500)
          throw new TypeError("Control plane unavailable");
        const problem = await response.json().catch(() => ({}));
        await this.vault.delete("offline-license");
        this.current = undefined;
        await this.changed(null);
        throw new DomainError(
          "ENTITLEMENT",
          problem.error === "Verify your authenticator code to continue."
            ? problem.error
            : response.status === 403
              ? "This device is revoked or your device limit is reached. Manage devices in your account."
              : "Sign in again or complete account verification.",
        );
      }
      const signed: Signed = await response.json();
      const expected = {
        account,
        device,
        environment: this.config.environment,
        sequence: cache?.account === account ? cache.sequence : 0,
        lastSeen: cache?.account === account ? cache.lastSeen : 0,
      };
      const license = verifyLicense(signed, this.config.publicKeys, expected);
      await this.vault.set(
        "offline-license",
        JSON.stringify({
          ...expected,
          sequence: license.sequence,
          lastSeen: Date.now(),
          signed,
        }),
      );
      this.current = license;
      this.lastOnline = Date.now();
      await this.changed(license, this.user(session.data.session.user));
      return license;
    } catch (e) {
      if (e instanceof DomainError) throw e;
      // Offline grace only for genuine transport/timeouts or server unavailability. Invalid signatures fail closed.
      if (!(
        e instanceof TypeError ||
        (e instanceof Error && ["TimeoutError", "AbortError"].includes(e.name))
      ))
        throw new DomainError(
          "ENTITLEMENT",
          "License verification failed. Reconnect to refresh your account.",
        );
      if (cache) {
        const license = verifyLicense(cache.signed, this.config.publicKeys, {
          ...cache,
          environment: this.config.environment,
        });
        await this.vault.set(
          "offline-license",
          JSON.stringify({
            ...cache,
            lastSeen: Math.max(cache.lastSeen, Date.now()),
          }),
        );
        this.current = license;
        await this.changed(license);
        return license;
      }
      throw new DomainError(
        "ENTITLEMENT",
        "Connect to the internet and sign in to activate this device. Local data has been retained.",
      );
    }
  }
}
