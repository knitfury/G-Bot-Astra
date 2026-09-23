import { createServer, type Server } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { SecretVault } from "../runtime/storage";
import { DomainError } from "../runtime/errors";
import { externalURL } from "../runtime/security";
export function validState(expected: string, received: string | null): boolean {
  return (
    !!received &&
    Buffer.byteLength(expected) === Buffer.byteLength(received) &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(received))
  );
}
export class DesktopOAuth implements OAuthClientProvider {
  interactive = true;
  readonly redirectUrl = "http://127.0.0.1:43827/oauth/callback";
  readonly clientMetadata = {
    client_name: "G-Bot",
    redirect_uris: [this.redirectUrl],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
  private nonce = randomBytes(32).toString("base64url");
  private verifier = "";
  private server?: Server;
  private pending?: Promise<string>;
  private timer?: NodeJS.Timeout;
  constructor(
    private id: string,
    private vault: SecretVault,
    private launch: (url: string) => Promise<void>,
    private clientId?: string,
    private event: (event: string) => void = () => {},
  ) {}
  state() {
    return this.nonce;
  }
  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    if (this.clientId) return { client_id: this.clientId };
    const raw = await this.vault.get(`${this.id}:oauth-client`);
    return raw ? JSON.parse(raw) : undefined;
  }
  async saveClientInformation(info: OAuthClientInformationMixed) {
    await this.vault.set(`${this.id}:oauth-client`, JSON.stringify(info));
  }
  async tokens(): Promise<OAuthTokens | undefined> {
    const raw = await this.vault.get(`${this.id}:oauth-tokens`);
    return raw ? JSON.parse(raw) : undefined;
  }
  async saveTokens(tokens: OAuthTokens) {
    await this.vault.set(`${this.id}:oauth-tokens`, JSON.stringify(tokens));
    this.event("Authorization refreshed");
  }
  saveCodeVerifier(value: string) {
    this.verifier = value;
  }
  codeVerifier() {
    if (!this.verifier)
      throw new DomainError(
        "MCP_AUTH",
        "OAuth session expired. Reconnect to start again.",
      );
    return this.verifier;
  }
  async redirectToAuthorization(url: URL) {
    if (!this.interactive) {
      this.event("Authorization expired");
      throw new DomainError(
        "MCP_EXPIRED",
        "Authorization expired. Reconnect this server to sign in again.",
      );
    }
    const target = externalURL(url.href);
    if (url.searchParams.get("state") !== this.nonce)
      throw new DomainError("MCP_AUTH", "OAuth state mismatch.");
    this.pending = new Promise<string>((resolve, reject) => {
      this.server = createServer((req, res) => {
        const callback = new URL(req.url ?? "/", this.redirectUrl);
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("Cache-Control", "no-store");
        if (
          req.method !== "GET" ||
          callback.pathname !== "/oauth/callback" ||
          !validState(this.nonce, callback.searchParams.get("state"))
        ) {
          res.writeHead(400);
          res.end("Invalid authorization callback.");
          return;
        }
        const code = callback.searchParams.get("code");
        res.end(
          code
            ? "Authorization received. Return to G-Bot."
            : "Authorization declined. Return to G-Bot.",
        );
        this.close();
        if (code) resolve(code);
        else
          reject(
            new DomainError(
              "MCP_AUTH",
              "Authorization was declined. Reconnect when ready.",
            ),
          );
      });
      this.server.once("error", () => {
        this.close();
        reject(
          new DomainError(
            "MCP_AUTH",
            "OAuth callback port is unavailable. Close the other authorization attempt and retry.",
          ),
        );
      });
      this.server.listen(43827, "127.0.0.1", () => {
        void this.launch(target).catch(() => {
          this.close();
          reject(
            new DomainError(
              "MCP_AUTH",
              "Could not open the authorization browser.",
            ),
          );
        });
      });
      this.timer = setTimeout(() => {
        this.close();
        reject(
          new DomainError(
            "MCP_AUTH",
            "Authorization timed out. Reconnect to try again.",
          ),
        );
      }, 120_000);
    });
    // Prevent an unhandled rejection while the SDK unwinds UnauthorizedError.
    void this.pending.catch(() => {});
  }
  async code() {
    if (!this.pending)
      throw new DomainError("MCP_AUTH", "Reconnect to authorize this server.");
    return this.pending;
  }
  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ) {
    if (scope === "all" || scope === "client")
      await this.vault.delete(`${this.id}:oauth-client`);
    if (scope === "all" || scope === "tokens")
      await this.vault.delete(`${this.id}:oauth-tokens`);
    if (scope === "all" || scope === "verifier") this.verifier = "";
  }
  close() {
    if (this.timer) clearTimeout(this.timer);
    this.server?.close();
    this.server = undefined;
  }
}
