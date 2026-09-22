import type {
  AIProviderConnection,
  Attachment,
  BusinessRecord,
  Category,
  Conversation,
  Database,
  Diagnostics,
  Entitlement,
  MCPConnection,
  Plan,
  Preferences,
  ProviderInput,
  User,
} from "@/types/domain";
export interface AuthService {
  login(email: string, password: string): Promise<User>;
  signup(name: string, email: string, password: string): Promise<User>;
  logout(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  demo(): Promise<void>;
}
export interface AccountService {
  get(): Promise<User | null>;
  update(name: string): Promise<void>;
  clearHistory(): Promise<void>;
  reset(): Promise<void>;
  preferences(values: Partial<Preferences>): Promise<void>;
}
export interface EntitlementService {
  get(): Promise<Entitlement>;
  change(plan: Plan): Promise<void>;
  expire(expired: boolean): Promise<void>;
}
export interface AIProviderService {
  list(): Promise<AIProviderConnection[]>;
  save(input: ProviderInput, id?: string): Promise<void>;
  test(input: ProviderInput): Promise<string[]>;
  testSaved(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}
export interface MCPConnectionService {
  list(): Promise<MCPConnection[]>;
  save(
    input: Pick<MCPConnection, "name" | "url" | "category" | "auth" | "slot">,
    id?: string,
  ): Promise<string>;
  connect(id: string, consent: boolean): Promise<void>;
  disconnect(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  records(category: Category): Promise<BusinessRecord[]>;
}
export interface MCPToolService {
  toggle(connectionId: string, toolId: string, enabled: boolean): Promise<void>;
}
export interface ConversationService {
  list(): Promise<Conversation[]>;
  create(model: string): Promise<string>;
  rename(id: string, title: string): Promise<void>;
  remove(id: string): Promise<void>;
  feedback(
    conversationId: string,
    messageId: string,
    value: "up" | "down",
  ): Promise<void>;
}
export interface ToolExecutionService {
  run(
    conversationId: string,
    prompt: string,
    model: string,
    attachments: Attachment[],
  ): Promise<void>;
  stop(conversationId: string): void;
  retry(conversationId: string): Promise<void>;
}
export interface ApprovalService {
  resolve(
    id: string,
    approve: boolean,
    inputs?: { recipient: string; subject: string; body: string },
  ): Promise<void>;
}
export interface ActivityService {
  list(): Promise<Database["activity"]>;
}
export interface AttachmentService {
  process(file: File): Promise<Attachment>;
  url(url: string): Promise<Attachment>;
}
export interface SecureStorageService {
  clear(): Promise<void>;
  status(): Promise<string>;
}
export interface UpdateService {
  check(): Promise<void>;
  download(): Promise<void>;
}
export interface DiagnosticService {
  set(input: Partial<Diagnostics>): Promise<void>;
}
export interface Services {
  auth: AuthService;
  account: AccountService;
  entitlements: EntitlementService;
  providers: AIProviderService;
  connections: MCPConnectionService;
  tools: MCPToolService;
  conversations: ConversationService;
  execution: ToolExecutionService;
  approvals: ApprovalService;
  activity: ActivityService;
  attachments: AttachmentService;
  secureStorage: SecureStorageService;
  updates: UpdateService;
  diagnostics: DiagnosticService;
  snapshot(): Promise<Database>;
  subscribe(listener: () => void): () => void;
  hydrate(): void;
}
