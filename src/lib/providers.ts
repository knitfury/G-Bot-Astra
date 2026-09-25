import type { Entitlement, ProviderInput, ProviderType } from "../types/domain";
import { routersAvailable } from "./entitlements";
export const isRouter = (type: ProviderType) =>
  type === "OpenRouter" || type === "OmniRoute";
export const routerModel = (type: ProviderType) =>
  type === "OpenRouter" ? "openrouter/auto" : "auto";
export const providerEndpoint = (type: ProviderType) =>
  type === "OpenRouter"
    ? "https://openrouter.ai/api/v1"
    : type === "OmniRoute"
      ? ""
      : type === "Anthropic-compatible"
        ? "https://api.anthropic.com"
        : type === "Gemini-compatible"
          ? "https://generativelanguage.googleapis.com"
          : type === "OpenAI-compatible"
            ? "https://api.openai.com/v1"
            : "https://inference.example.com/v1";
export const routerDisclosure =
  "Experimental — Router compatibility varies. Automatic model routing may change the selected model based on availability, limits, capabilities and router policy. MCP workflows require tool/function calling support. Availability, pricing, rate limits and model selection are controlled by the router/provider; provider charges apply.";
export function validateRouter(input: ProviderInput, entitlement: Entitlement) {
  // Recognize the known hosted router even if a legacy config used the custom type.
  const hosted = (() => {
    try {
      return new URL(input.baseUrl).hostname === "openrouter.ai";
    } catch {
      return false;
    }
  })();
  if (!isRouter(input.type) && !hosted) return;
  if (!routersAvailable(entitlement))
    throw new Error(
      "Experimental Routers require Starter or Business. Compare plans to enable automatic model routing.",
    );
  if (input.model !== (hosted ? "openrouter/auto" : routerModel(input.type)))
    throw new Error("Use the router's automatic model routing option.");
}
