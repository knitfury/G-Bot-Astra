export const supportURL =
  "mailto:gbot@vidinex.ee?subject=G-Bot%20Support%20%E2%80%94%20Desktop";
export const cacheMessage = "Clear G-Bot’s cached web files and cookies?";
export const cacheDetail =
  "This preserves your native account session, MCP and AI credentials, conversations, preferences, Demo workspace, attachments and user files. Your external browser is unaffected. Cookie-based sessions inside G-Bot may require sign-in again; native account tokens are stored separately.";
export async function clearWebCache(session: {
  clearCache(): Promise<void>;
  clearStorageData(options: { storages: "cookies"[] }): Promise<void>;
}) {
  await session.clearCache();
  await session.clearStorageData({ storages: ["cookies"] });
}
// A single coordinator is shared by Quit and Restart; no forced exit or action replay.
export class Shutdown {
  private pending?: Promise<void>;
  constructor(
    private drain: () => Promise<void>,
    private save: () => Promise<void>,
    private finish: (restart: boolean) => void,
  ) {}
  run(restart = false) {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      await this.drain();
      await this.save();
      this.finish(restart);
    })().catch((error) => {
      this.pending = undefined;
      throw error;
    });
    return this.pending;
  }
}
