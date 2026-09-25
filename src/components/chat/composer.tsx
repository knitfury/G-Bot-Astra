"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  Paperclip,
  Image,
  LinkSimple,
  ArrowUp,
  Stop,
  X,
  Plugs,
  CaretDown,
  FileText,
} from "@phosphor-icons/react";
import { desktopCall, isDesktop } from "@/services/desktop/client";
import { services } from "@/services";
import { useSnapshot, useAction } from "@/hooks/use-services";
import { useWorkspace } from "@/stores/workspace";
import { connectionAvailable } from "@/lib/entitlements";
import type { Attachment } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState, Badge, AppIcon } from "@/components/common/ui";
export function AttachmentChip({
  attachment: a,
  onRemove,
}: {
  attachment: Attachment;
  onRemove?: () => void;
}) {
  return (
    <div
      className={`attachment-chip ${a.status === "failed" || a.status === "unsupported" ? "invalid" : ""}`}
    >
      <span>
        {a.preview ? (
          <img src={a.preview} alt={a.name} />
        ) : a.kind === "URL" ? (
          <LinkSimple size={17} />
        ) : a.kind === "image" ? (
          <Image size={17} />
        ) : (
          <FileText size={17} />
        )}
      </span>
      <div>
        <strong>{a.name}</strong>
        <small>
          {a.status === "ready"
            ? a.kind === "URL"
              ? "Link attached · mock preview"
              : `${(a.size / 1024).toFixed(0)} KB · ready`
            : a.error || a.status}
        </small>
      </div>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remove ${a.name}`}
          onClick={onRemove}
        >
          <X size={12} />
        </Button>
      )}
    </div>
  );
}
export function ModelSelector() {
  const { data } = useSnapshot();
  const model = useWorkspace((s) => s.model),
    setModel = useWorkspace((s) => s.setModel);
  const models =
    data?.providers
      .filter((p) => p.status === "connected")
      .flatMap((p) =>
        p.models
          .filter((m) => m.enabled)
          .map((m) => ({ ...m, provider: p.name })),
      ) || [];
  return (
    <select
      className="model-selector"
      aria-label="AI model"
      value={models.some((m) => m.id === model) ? model : models[0]?.id || ""}
      onChange={(e) => setModel(e.target.value)}
    >
      {!models.length && <option value="">No AI provider</option>}
      {models.map((m) => (
        <option value={m.id} key={m.id}>
          {m.name} · {m.provider}
        </option>
      ))}
    </select>
  );
}
export function ChatComposer({
  running,
  pendingApproval,
  onSend,
  onStop,
}: {
  running: boolean;
  pendingApproval: boolean;
  onSend: (text: string, attachments: Attachment[]) => Promise<void>;
  onStop: () => void;
}) {
  const { data } = useSnapshot(),
    action = useAction();
  const cid = useWorkspace((s) => s.conversationId),
    text = useWorkspace((s) => s.drafts[cid] || ""),
    setDraft = useWorkspace((s) => s.setDraft);
  const [attachments, setAttachments] = useState<Attachment[]>([]),
    [dragging, setDragging] = useState(false),
    [urlOpen, setUrlOpen] = useState(false),
    [url, setUrl] = useState(""),
    [context, setContext] = useState(false),
    [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null),
    image = useRef<HTMLInputElement>(null);
  const available = data?.providers.some(
    (p) => p.status === "connected" && p.models.some((m) => m.enabled),
  );
  async function files(list: FileList | null) {
    if (!list) return;
    const room = 5 - attachments.length;
    if (list.length > room) {
      setError("Attach up to 5 files or links per request.");
      return;
    }
    for (const f of Array.from(list)) {
      const id = crypto.randomUUID();
      setAttachments((a) => [
        ...a,
        {
          id,
          name: f.name,
          kind: f.type.startsWith("image/") ? "image" : "file",
          size: f.size,
          mime: f.type,
          status: "processing",
        },
      ]);
      try {
        const a = await services.attachments.process(f);
        setAttachments((current) => current.map((x) => (x.id === id ? a : x)));
      } catch {
        setAttachments((current) =>
          current.map((x) =>
            x.id === id
              ? {
                  ...x,
                  status: "failed",
                  error: "File could not be processed.",
                }
              : x,
          ),
        );
      }
    }
  }
  async function send() {
    if (
      running ||
      pendingApproval ||
      !available ||
      attachments.some((a) => a.status !== "ready") ||
      (!text.trim() && !attachments.length)
    )
      return;
    setError("");
    const saved = text;
    setDraft(cid, "");
    const current = attachments;
    setAttachments([]);
    try {
      await onSend(saved, current);
    } catch (e) {
      setDraft(cid, saved);
      setAttachments(current);
      setError(e instanceof Error ? e.message : "Could not send request.");
    }
  }
  return (
    <div className="composer-wrap">
      {!available && (
        <div className="composer-notice">
          Connect an AI provider to run a request.{" "}
          <Link href="/providers">
            Connect AI provider
            <ArrowUp size={12} />
          </Link>
        </div>
      )}
      {pendingApproval && (
        <div className="composer-notice">
          An action is waiting for your approval above. Approve or reject it to
          continue.
        </div>
      )}
      <div
        className={`composer ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void files(e.dataTransfer.files);
        }}
      >
        {dragging && (
          <div className="drop-label">Drop files to add context</div>
        )}
        {attachments.length > 0 && (
          <div className="attachment-list">
            {attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                attachment={a}
                onRemove={() => {
                  setAttachments((list) => list.filter((x) => x.id !== a.id));
                  if(isDesktop())void desktopCall("desktop.removeAttachment",a.id).catch(()=>{});
                }}
              />
            ))}
          </div>
        )}
        <textarea
          aria-label="Message G-Bot"
          placeholder="Ask G-Bot to get something done…"
          value={text}
          rows={2}
          onChange={(e) => setDraft(cid, e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="composer-toolbar">
          <div className="row">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Attach file"
              onClick={() => {
                if (!isDesktop()) {
                  file.current?.click();
                  return;
                }
                void desktopCall("desktop.pickFiles")
                  .then((files) =>
                    setAttachments((current) =>
                      [...current, ...files].slice(0, 5),
                    ),
                  )
                  .catch((e) => setError(e.message));
              }}
            >
              <Paperclip size={19} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Attach image"
              onClick={() => image.current?.click()}
            >
              <Image size={19} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Attach URL"
              onClick={() => setUrlOpen(true)}
            >
              <LinkSimple size={19} />
            </Button>
            <span className="toolbar-divider" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setContext(!context)}
              aria-expanded={context}
            >
              <Plugs size={15} />
              <span className="tools-label">Tools</span>
              <CaretDown size={10} />
            </Button>
          </div>
          <div className="row">
            <span className="enter-hint">↵ to send</span>
            {running ? (
              <Button
                variant="default"
                size="icon"
                aria-label="Stop generation"
                onClick={onStop}
              >
                <Stop weight="fill" size={17} />
              </Button>
            ) : (
              <Button
                variant="default"
                size="icon"
                aria-label="Send message"
                disabled={
                  pendingApproval ||
                  !available ||
                  (!text.trim() && !attachments.length) ||
                  attachments.some((a) => a.status !== "ready")
                }
                onClick={() => void send()}
              >
                <ArrowUp size={20} weight="bold" />
              </Button>
            )}
          </div>
        </div>
        {context && (
          <div className="composer-context">
            {data?.connections
              .filter((c) => connectionAvailable(data.entitlement, c))
              .map((c) => (
                <span className="row" key={c.id}>
                  <AppIcon category={c.category} size={13} />
                  {c.name}
                  <Badge>{c.tools.filter((t) => t.enabled).length} tools</Badge>
                </span>
              ))}
            <Link href="/connections">Manage tools and permissions</Link>
          </div>
        )}
      </div>
      {error && <ErrorState message={error} />}
      <p className="composer-caption">
        Your apps provide context. You stay in control.{" "}
        <span>{data?.runtime ? "Check important details before acting." : "Simulated responses · check important details."}</span>
      </p>
      <input
        className="sr-only"
        tabIndex={-1}
        type="file"
        ref={file}
        multiple
        accept=".pdf,.txt,.csv,.md,.docx"
        onChange={(e) => {
          void files(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        className="sr-only"
        tabIndex={-1}
        type="file"
        ref={image}
        multiple
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          void files(e.target.files);
          e.target.value = "";
        }}
      />
      <Dialog
        open={urlOpen}
        onOpenChange={setUrlOpen}
        title="Attach a link"
        description={
          data?.runtime
            ? "Share this link with your selected AI provider. G-Bot does not automatically fetch the page."
            : "Add a URL to explore context. Demo Mode does not fetch live pages."
        }
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (attachments.length >= 5) {
              setError("Attach up to 5 items.");
              return;
            }
            void action
              .mutateAsync(() => services.attachments.url(url))
              .then((a) => {
                setAttachments((list) => [...list, a as Attachment]);
                setUrl("");
                setUrlOpen(false);
              })
              .catch(() => {});
          }}
        >
          <label className="field">
            URL
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/product"
              required
            />
          </label>
          {action.error && <ErrorState message={action.error.message} />}
          <Button variant="default" disabled={action.isPending} type="submit">
            {action.isPending ? "Preparing preview…" : "Attach link"}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
