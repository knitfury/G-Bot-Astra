import { verifyCatalog } from "../../src/production/signed";
import type { Catalog } from "../../src/production/model";
import type { SecretVault } from "./storage";
export class CatalogClient {
  constructor(
    private vault: SecretVault,
    private origin: string,
    private keys: Record<string, string>,
  ) {}
  async get(): Promise<{
    catalog: Catalog | null;
    cached: boolean;
    message: string;
  }> {
    const saved = await this.vault.get("catalog-cache");
    let last: Catalog | null = null;
    if (saved) {
      try {
        last = verifyCatalog(JSON.parse(saved), this.keys);
      } catch {
        /* Expired or tampered cache must not recommend integrations. */
      }
    }
    try {
      const r = await fetch(`${this.origin}/api/catalog`, {
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw Error();
      const raw = await r.text();
      if (raw.length > 500_000) throw Error();
      const signed: unknown = JSON.parse(raw),
        catalog = verifyCatalog(signed, this.keys, last?.sequence ?? 0);
      await this.vault.set("catalog-cache", JSON.stringify(signed));
      return { catalog, cached: false, message: "" };
    } catch {
      return {
        catalog: last,
        cached: !!last,
        message: last
          ? "Catalog unavailable. Showing the last verified catalog."
          : "Recommended connections are currently unavailable. You can still add a Custom MCP connection.",
      };
    }
  }
}
