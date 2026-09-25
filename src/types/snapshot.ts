export type SnapshotKind = "mail" | "inventory" | "crm" | "orders" | "accounting" | "shipping";
export interface SnapshotItem { id:string; title:string; subtitle:string; preview:string; status:string; fields:Record<string,string> }
export interface BusinessSnapshot { connectionId:string; kind:SnapshotKind|null; state:"ready"|"empty"|"partial"|"unknown"|"permission"|"disconnected"|"error"; items:SnapshotItem[]; refreshedAt:string|null; message:string; sourceTools:string[] }
