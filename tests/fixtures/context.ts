import type { MCPConnection, MCPTool } from "../../src/types/domain";
export const contexts = {
  mail: {
    structuredContent: {
      envelope: {
        records: [
          {
            from: "Maya",
            subject: "Quote request",
            date: "2030-06-01",
            preview: "Need 12 lamps",
          },
        ],
      },
    },
  },
  inventory: {
    structuredContent: {
      catalogue: [
        {
          name: "Desk lamp",
          sku: "LAMP-1",
          price: 29,
          currency: "EUR",
          quantity: 12,
        },
      ],
    },
  },
  crm: {
    structuredContent: {
      pipeline: [
        {
          name: "New lead",
          stage: "Qualified",
          value: 420,
          created_at: "2030-06-01",
        },
      ],
    },
  },
  calendar: {
    contents: [
      {
        uri: "calendar://upcoming",
        mimeType: "application/json",
        text: JSON.stringify({
          events: [
            { title: "Customer meeting", start: "2030-06-02T10:00:00Z" },
          ],
        }),
      },
    ],
  },
  unknown: {
    structuredContent: {
      envelope: {
        measurements: [
          { quux: "Alpha", reading: 7 },
          { quux: "Beta", reading: 8 },
        ],
      },
    },
  },
};
export function contextConnection(id = "c", name = "Context"): MCPConnection {
  const tool: MCPTool = {
    id: `${id}:overview`,
    connectionId: id,
    name: "opaque_operation",
    label: "Overview",
    description: "Structured business overview",
    risk: "read",
    requiresApproval: false,
    enabled: true,
    annotations: { readOnlyHint: true, destructiveHint: false },
    schemaHash: "contract-v1",
    inputSchema: { type: "object", additionalProperties: false },
  };
  return {
    id,
    name,
    slot: 0,
    category: "Email",
    icon: "Email",
    url: `https://${id}.example/mcp`,
    auth: "None",
    status: "connected",
    enabled: true,
    tools: [tool],
    lastConnected: "",
    error: "",
    permissionSummary: "",
    maskedCredential: "",
  };
}
