export type ErrorCode =
  | "NETWORK"
  | "PROVIDER_AUTH"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "CAPABILITY"
  | "MCP_UNAVAILABLE"
  | "MCP_AUTH"
  | "MCP_EXPIRED"
  | "MCP_PROTOCOL"
  | "TOOL_UNAVAILABLE"
  | "INVALID_ARGUMENTS"
  | "TOOL_FAILED"
  | "APPROVAL_REJECTED"
  | "ENTITLEMENT"
  | "SECURE_STORAGE"
  | "PERSISTENCE"
  | "CANCELLED";
export class DomainError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
export function safeError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  if (error instanceof Error && error.name === "AbortError")
    return new DomainError(
      "CANCELLED",
      "Stopped. You can start another request.",
    );
  return new DomainError(
    "NETWORK",
    "The operation could not finish. Check the connection and try again.",
  );
}
