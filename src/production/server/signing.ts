import { sign, createPrivateKey } from "node:crypto";
import type { Signed } from "../model";
// Import only into trusted server routes. Never into desktop or renderer bundles.
export function signEnvelope(value: unknown, keyId: string, privateKey: string): Signed {
 const payload=JSON.stringify(value);
 return {payload,keyId,signature:sign(null,Buffer.from(payload),createPrivateKey(privateKey)).toString("base64url")};
}
