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
    const highWater = Number((await this.vault.get("catalog-sequence")) ?? 0);
    const minimum =
      Number.isSafeInteger(highWater) && highWater >= 0 ? highWater : 0;
    let last: Catalog | null = null;
    if (saved) {
      try {
        last = verifyCatalog(JSON.parse(saved), this.keys, minimum);
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
        catalog = verifyCatalog(
          signed,
          this.keys,
          Math.max(minimum, last?.sequence ?? 0),
        );
      await this.vault.set("catalog-sequence", String(catalog.sequence));
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
