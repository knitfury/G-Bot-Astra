import type { MCPTool } from "../../src/types/domain";
// A negative signal can veto authority; names/descriptions never grant it.
export function mutationVeto(t: MCPTool): boolean {
  const words = t.name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_./-]/g, " ");
  return (
    t.risk === "destructive" ||
    t.annotations?.destructiveHint === true ||
    t.annotations?.readOnlyHint === false ||
    /\b(send|create|update|delete|remove|disable|enable|mark|move|label|apply|archive|unarchive|modify|set|write|admin|refund|purchase|change|flag|unflag|trash|restore|revoke)\b/i.test(
      words,
    )
  );
}
export function declaredRead(t: MCPTool): boolean {
  return (
    !mutationVeto(t) &&
    t.annotations?.readOnlyHint === true &&
    t.risk === "read" &&
    !t.requiresApproval
  );
}
export function readReason(t: MCPTool): string {
  if (mutationVeto(t))
    return "Conflicting or state-changing operation metadata. Automatic execution is blocked.";
  if (!declaredRead(t))
    return "No verified read-only declaration or trusted catalog grant. Automatic execution is blocked.";
  return "Server-declared read-only. Only enable automatic access for a server you trust.";
}
