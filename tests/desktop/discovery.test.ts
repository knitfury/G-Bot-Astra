import test from "node:test";
import assert from "node:assert/strict";
import { discoveryDetails } from "../../src/lib/mcp-discovery";
import type { MCPConnection } from "../../src/types/domain";
test("support discovery excludes endpoint, auth, descriptions, schema literals and business data", () => {
  const result = JSON.stringify(
    discoveryDetails({
      url: "https://secret.invalid/private-token",
      maskedCredential: "secret",
      tools: [
        {
          name: "listEmails",
          description: "secret",
          annotations: { readOnlyHint: true },
          inputSchema: {
            type: "object",
            required: ["accountId"],
            properties: {
              accountId: {
                type: "string",
                default: "secret",
                examples: ["secret"],
                enum: ["secret"],
              },
            },
          },
        },
      ],
    } as unknown as MCPConnection),
  );
  assert.ok(!result.includes("secret"));
  assert.match(result, /accountId/);
  assert.match(result, /readOnlyHint/);
  assert.ok(!result.includes("https:"));
});
