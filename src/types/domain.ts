export type Plan = "free" | "starter" | "business";
export type ThemeColor = "orange" | "purple" | "blue" | "green" | "neutral";
export type Appearance = "light" | "dark";
export type Status =
  | "connected"
  | "disconnected"
  | "connecting"
  | "needs authentication"
  | "error"
  | "degraded"
  | "reconnecting"
  | "authorization expired"
  | "authenticating";
export type TaskStatus =
  | "queued"
  | "running"
  | "approval required"
  | "completed"
  | "failed"
  | "cancelled";
export type Category =
  | "Email"
  | "CRM"
  | "Inventory"
  | "Accounting"
  | "Helpdesk"
  | "Calendar"
  | "Documents"
  | "Projects"
  | "Ecommerce"
  | "Shipping"
  | "Logistics"
  | "Custom";
export type ProviderType =
  | "Anthropic-compatible"
  | "OpenAI-compatible"
  | "Gemini-compatible"
  | "Custom OpenAI-compatible"
  | "Generic REST";
export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  status: "active";
  createdAt: string;
}
export interface Entitlement {
  plan: Plan;
  status: "active" | "expired";
  maxActiveConnections: number;
  renewalAt: string;
  flags: { customProviders: boolean; approvals: boolean };
}
export interface AIModel {
  id: string;
  providerId: string;
  identifier: string;
  name: string;
  capabilities: string[];
  context: number;
  enabled: boolean;
  default: boolean;
}
export interface ProviderInput {
  name: string;
  type: ProviderType;
  baseUrl: string;
  key: string;
  model: string;
  headers: string;
  method: "POST" | "GET";
  auth: "Bearer" | "API key" | "None";
  body: string;
  inputPath: string;
  responsePath: string;
  tools: boolean;
}
export interface AIProviderConnection extends Omit<ProviderInput, "key"> {
  id: string;
  status: Status;
  maskedCredential: string;
  models: AIModel[];
  createdAt: string;
  updatedAt: string;
  lastTest: string;
}
export interface MCPTool {
  inputSchema?: Record<string, unknown>;
  schemaHash?: string;
  id: string;
  connectionId: string;
  name: string;
  label: string;
  description: string;
  risk: "read" | "write" | "destructive";
  requiresApproval: boolean;
  enabled: boolean;
}
export interface MCPConnection {
  id: string;
  slot: number;
  name: string;
  category: Category;
  icon: Category;
  url: string;
  auth: "OAuth" | "Token" | "None";
  authHeader?: string;
  oauthClientId?: string;
  status: Status;
  enabled: boolean;
  tools: MCPTool[];
  lastConnected: string;
  error: string;
  permissionSummary: string;
  maskedCredential: string;
}
export interface WorkspacePane {
  side: "left" | "right";
  enabled: boolean;
  selectedConnectionId: string;
  width: number;
  collapsed: boolean;
}
export interface Attachment {
  id: string;
  kind: "file" | "image" | "URL";
  name: string;
  size: number;
  mime: string;
  url?: string;
  preview?: string;
  status: "processing" | "ready" | "unsupported" | "failed";
  error?: string;
}
export interface ToolCall {
  id: string;
  connectionId: string;
  toolId: string;
  label: string;
  input: string;
  status: TaskStatus;
  startedAt: string;
  endedAt?: string;
  output: string;
  error?: string;
  requiresApproval: boolean;
}
export interface ApprovalRequest {
  arguments?: Record<string, unknown>;
  binding?: string;
  executionState?: "not started" | "started" | "completed" | "uncertain";
  id: string;
  conversationId: string;
  messageId: string;
  connectionId: string;
  toolId: string;
  action: string;
  consequence: string;
  inputs: { recipient: string; subject: string; body: string };
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdAt: string;
  resolvedAt?: string;
}
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  attachments: Attachment[];
  model: string;
  tools: ToolCall[];
  status: TaskStatus;
  approvalId?: string;
  feedback?: "up" | "down";
}
export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  messages: Message[];
  scenario?: "inventory" | "support" | "summary";
}
export interface ActivityEvent {
  id: string;
  timestamp: string;
  actor: string;
  conversationId: string;
  connectionId: string;
  tool: string;
  action: string;
  outcome: TaskStatus;
  approvalRequired: boolean;
  detail: string;
}
export interface BusinessRecord {
  id: string;
  category: Category;
  customer: string;
  company: string;
  title: string;
  subtitle: string;
  body: string;
  metadata: Record<string, string>;
  status: string;
}
export interface Diagnostics {
  offline: boolean;
  inventoryFailure: boolean;
  toolFailure: boolean;
  providerFailure: boolean;
  oauthFailure: boolean;
  noTools: boolean;
  authFailure: "none" | "credentials" | "network";
}
export interface Preferences {
  historyRetention?: 0 | 30 | 90 | 180;
  diagnosticsConsent?: boolean;
  onboardingStep?: number;
  startup: boolean;
  notifications: boolean;
  activityVisible: boolean;
}
export interface Database {
  schema: 1;
  user: User | null;
  entitlement: Entitlement;
  providers: AIProviderConnection[];
  connections: MCPConnection[];
  conversations: Conversation[];
  approvals: ApprovalRequest[];
  activity: ActivityEvent[];
  records: BusinessRecord[];
  diagnostics: Diagnostics;
  preferences: Preferences;
  updateStatus:
    | "idle"
    | "available"
    | "downloading"
    | "restart required"
    | "checking"
    | "up to date"
    | "failed";
  runtime?: {
    mode: "desktop";
    production?: boolean;
    version: string;
    notice: string;
    updateError?: string;
    sessionNotice?: string;
  };
  revision: number;
}
