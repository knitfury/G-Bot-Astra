import type {
  AIProviderConnection,
  BusinessRecord,
  Category,
  Database,
  MCPConnection,
  MCPTool,
} from "@/types/domain";
import { entitlementFor } from "@/lib/entitlements";
export const categories: Category[] = [
  "Email",
  "CRM",
  "Inventory",
  "Accounting",
  "Helpdesk",
  "Calendar",
  "Documents",
  "Projects",
];
const date = "2026-09-22T09:00:00.000Z";
export function toolsFor(id: string, category: Category): MCPTool[] {
  const labels: Record<Category, [string, string]> = {
    Email: ["Find customer emails", "Send email"],
    CRM: ["Find customer profile", "Update customer record"],
    Inventory: ["Check stock availability", "Adjust stock"],
    Accounting: ["Read invoices", "Create invoice"],
    Helpdesk: ["Read support tickets", "Create support ticket"],
    Calendar: ["Find meetings", "Create meeting"],
    Documents: ["Search documents", "Create document"],
    Projects: ["Read project tasks", "Create task"],
  };
  return labels[category].map((label, i) => ({
    id: `${id}-${i}`,
    connectionId: id,
    name: `${category.toLowerCase()}.${i ? "write" : "read"}`,
    label,
    description: i
      ? `G-Bot can ${label.toLowerCase()} after your approval.`
      : `G-Bot can ${label.toLowerCase()} from this connection.`,
    risk: i ? "write" : "read",
    requiresApproval: !!i,
    enabled: true,
  }));
}
export function demoConnections(): MCPConnection[] {
  return categories.map((category, slot) => ({
    id: `app-${slot}`,
    slot,
    name: {
      Email: "Zoho Mail",
      CRM: "Customer CRM",
      Inventory: "Stockroom",
      Accounting: "Books",
      Helpdesk: "Support Desk",
      Calendar: "Team Calendar",
      Documents: "WorkDrive",
      Projects: "Projects",
    }[category],
    category,
    icon: category,
    url: `https://demo.example.com/${category.toLowerCase()}/mcp`,
    auth: "OAuth",
    status: "connected",
    enabled: true,
    tools: toolsFor(`app-${slot}`, category),
    lastConnected: date,
    error: "",
    permissionSummary: `Read ${category.toLowerCase()} context. Changes always need approval.`,
    maskedCredential: "Demo credential ••••",
  }));
}
export function demoProvider(): AIProviderConnection {
  return {
    id: "provider-demo",
    name: "OpenAI",
    type: "OpenAI-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-demo",
    headers: "{}",
    method: "POST",
    auth: "Bearer",
    body: '{"model":"{{model}}","messages":[{"role":"user","content":"{{input}}"}]}',
    inputPath: "messages[0].content",
    responsePath: "choices[0].message.content",
    tools: true,
    status: "connected",
    maskedCredential: "Demo credential ••••",
    createdAt: date,
    updatedAt: date,
    lastTest: date,
    models: [
      {
        id: "model-demo",
        providerId: "provider-demo",
        identifier: "gpt-demo",
        name: "GPT · Demo",
        capabilities: ["text", "images", "tools"],
        context: 128000,
        enabled: true,
        default: true,
      },
      {
        id: "model-fast",
        providerId: "provider-demo",
        identifier: "gpt-fast-demo",
        name: "GPT Fast · Demo",
        capabilities: ["text", "tools"],
        context: 64000,
        enabled: true,
        default: false,
      },
    ],
  };
}
const customers = [
  {
    name: "Maya Dawson",
    company: "Dawson Studio",
    email: "maya@dawson.example",
    product: "Arc Desk Lamp",
    sku: "ARC-120-S",
    stock: "24",
    order: "DS-1042",
    qty: "12",
    issue: "Confirm stock for the studio fit-out",
    body: "Hi Alex, could you confirm whether 12 Arc Desk Lamps in sand are available? We would love delivery by Friday for our studio fit-out. Thank you, Maya.",
  },
  {
    name: "Leo Chen",
    company: "Northwind Design",
    email: "leo@northwind.example",
    product: "Orbit Dock",
    sku: "ORB-240",
    stock: "8",
    order: "NW-2081",
    qty: "2",
    issue: "Orbit Dock disconnects from the display",
    body: "Hi, the two Orbit Docks from order NW-2081 keep disconnecting from our displays. We have tried new cables. Could your support team help? Thanks, Leo.",
  },
  {
    name: "Amara Patel",
    company: "Fern & Field",
    email: "amara@fern.example",
    product: "Form Monitor Stand",
    sku: "FRM-310",
    stock: "3",
    order: "FF-3018",
    qty: "4",
    issue: "Availability for the new office",
    body: "Hello, we need four Form Monitor Stands for our new office. Can you check availability and let me know our options? Best, Amara.",
  },
];
export const records: BusinessRecord[] = customers.flatMap((c, i) =>
  categories.map((category) => ({
    id: `record-${i}-${category}`,
    category,
    customer: c.name,
    company: c.company,
    title:
      category === "Email"
        ? c.issue
        : category === "Inventory"
          ? c.product
          : category === "CRM"
            ? c.name
            : category === "Helpdesk"
              ? c.issue
              : category === "Accounting"
                ? `Invoice ${c.order}`
                : category === "Calendar"
                  ? `${c.company} check-in`
                  : category === "Documents"
                    ? `${c.company} project brief`
                    : `${c.company} delivery`,
    subtitle:
      category === "Email"
        ? c.email
        : category === "Inventory"
          ? c.sku
          : c.company,
    body:
      category === "Email"
        ? c.body
        : category === "CRM"
          ? `Long-term customer at ${c.company}. Latest order ${c.order}: ${c.qty} × ${c.product}. Prefers updates by email.`
          : category === "Inventory"
            ? `${c.product} is stocked in our Chennai warehouse. Reserve only after customer confirmation.`
            : category === "Helpdesk"
              ? `${c.issue}. Linked to order ${c.order}. Customer: ${c.email}.`
              : category === "Accounting"
                ? `Invoice for ${c.qty} × ${c.product}. Payment due September 30.`
                : category === "Calendar"
                  ? "Upcoming project check-in, Thursday at 10:00 AM."
                  : category === "Documents"
                    ? `Product specifications and delivery requirements for order ${c.order}.`
                    : `Prepare ${c.qty} × ${c.product} for ${c.company}.`,
    metadata: {
      email: c.email,
      product: c.product,
      SKU: c.sku,
      stock: c.stock,
      order: c.order,
      quantity: c.qty,
      location: "Chennai",
      updated: "Today, 9:12 AM",
    },
    status:
      category === "Inventory"
        ? Number(c.stock) < Number(c.qty)
          ? "Low stock"
          : "In stock"
        : category === "CRM"
          ? "Active customer"
          : category === "Helpdesk"
            ? "Open"
            : category === "Accounting"
              ? "Awaiting payment"
              : "Ready",
  })),
);
export const initialDatabase = (): Database => ({
  schema: 1,
  user: null,
  entitlement: entitlementFor("free"),
  providers: [],
  connections: [],
  conversations: [],
  approvals: [],
  activity: [],
  records,
  diagnostics: {
    offline: false,
    inventoryFailure: false,
    toolFailure: false,
    providerFailure: false,
    oauthFailure: false,
    noTools: false,
    authFailure: "none",
  },
  preferences: { startup: true, notifications: true, activityVisible: true },
  updateStatus: "idle",
  revision: 0,
});
