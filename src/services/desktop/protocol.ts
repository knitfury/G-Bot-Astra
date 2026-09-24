import type { Services } from "../contracts";
import type { Attachment } from "../../types/domain";
type Groups = Exclude<
  keyof Services,
  "snapshot" | "hydrate" | "subscribe" | "attachments"
>;
type UnionToIntersection<U> = (
  U extends unknown ? (x: U) => void : never
) extends (x: infer I) => void
  ? I
  : never;
type GroupCalls = UnionToIntersection<
  {
    [G in Groups]: {
      [M in keyof Services[G] as `${G}.${M & string}`]: Services[G][M];
    };
  }[Groups]
>;
export type Calls = GroupCalls & {
  snapshot: () => ReturnType<Services["snapshot"]>;
  "attachments.process": (file: {
    name: string;
    type: string;
    bytes: number[] | Uint8Array;
  }) => Promise<Attachment>;
  "attachments.url": Services["attachments"]["url"];
  "desktop.pickFiles": () => Promise<Attachment[]>;
  "desktop.readPreferences": () => Promise<string | null>;
  "desktop.savePreferences": (value: string | null) => Promise<void>;
  "desktop.signIn": (provider:"google"|"azure") => Promise<import("../../types/domain").User>;
  "desktop.verifyMfa": (code:string) => Promise<void>;
  "desktop.refreshLicense": () => Promise<unknown>;
  "desktop.openAccount": () => Promise<void>;
  "desktop.catalog": () => Promise<{catalog:import("../../production/model").Catalog|null;cached:boolean;message:string}>;
  "desktop.data": (action:"usage"|"clear-cache"|"clear-activity"|"backup"|"restore"|"json"|"markdown",password:string) => Promise<{message?:string;bytes?:number;freeBytes?:number;lowDisk?:boolean;cancelled?:boolean}>;
  "desktop.removeAttachment": (id: string) => Promise<void>;
  "desktop.retention": (days:0|30|90|180) => Promise<void>;
  "desktop.openDemo": () => Promise<void>;
  "desktop.diagnostics": () => Promise<string>;
  "desktop.installUpdate": () => Promise<void>;
};
export type Operation = keyof Calls;
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };
export interface DesktopBridge {
  call<K extends Operation>(
    operation: K,
    args: Parameters<Calls[K]>,
  ): Promise<Result<Awaited<ReturnType<Calls[K]>>>>;
  subscribe(listener: () => void): () => void;
}
declare global {
  interface Window {
    gbot?: DesktopBridge;
  }
}
