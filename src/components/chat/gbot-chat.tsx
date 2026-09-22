"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  ArrowDown,
  Copy,
  ThumbsUp,
  ThumbsDown,
  ArrowClockwise,
  Check,
  EnvelopeSimple,
  Headset,
  Receipt,
  Sparkle,
  ShieldCheck,
  ArrowRight,
} from "@phosphor-icons/react";
import { services } from "@/services";
import { useAction, useSnapshot } from "@/hooks/use-services";
import { useWorkspace } from "@/stores/workspace";
import type { Attachment, Message } from "@/types/domain";
import { Logo, ErrorState, Badge, Loading } from "@/components/common/ui";
import { Button } from "@/components/ui/button";
import { ChatComposer, AttachmentChip, ModelSelector } from "./composer";
import { ExecutionTimeline } from "./execution-timeline";
import { ApprovalCard } from "./approval-card";
const prompts = [
  {
    title: "Turn an email into a done deal",
    description: "Check Maya’s request, look up stock, and prepare a reply.",
    prompt:
      "Find Maya's latest email, check whether the product is available, and prepare a response.",
    icon: EnvelopeSimple,
    tags: ["Email", "Inventory"],
  },
  {
    title: "Give a customer a helping hand",
    description: "Summarize Northwind’s issue and create a support ticket.",
    prompt: "Summarize Leo at Northwind's issue and create a support ticket.",
    icon: Headset,
    tags: ["Email", "CRM", "Helpdesk"],
  },
  {
    title: "Get a clear view of what’s due",
    description: "Bring outstanding customer invoices into one view.",
    prompt: "Summarize the outstanding invoices for our customers.",
    icon: Receipt,
    tags: ["Accounting"],
  },
];
export function GBotChat() {
  const { data } = useSnapshot(),
    action = useAction();
  const cid = useWorkspace((s) => s.conversationId),
    select = useWorkspace((s) => s.setConversation),
    modelPreference = useWorkspace((s) => s.model),
    setDraft = useWorkspace((s) => s.setDraft);
  const bottom = useRef<HTMLDivElement>(null),
    scroller = useRef<HTMLDivElement>(null);
  const [nearBottom, setNearBottom] = useState(true),
    [starting, setStarting] = useState(false);
  const conversation = data?.conversations.find((c) => c.id === cid);
  const messages = conversation?.messages || [];
  const running = messages.some((m) => m.status === "running") || starting;
  const pending = !!data?.approvals.some(
    (a) => a.conversationId === cid && a.status === "pending",
  );
  const models =
    data?.providers
      .filter((p) => p.status === "connected")
      .flatMap((p) => p.models.filter((m) => m.enabled)) || [];
  const model =
    models.find((m) => m.id === modelPreference)?.id || models[0]?.id || "";
  useEffect(() => {
    if (nearBottom && messages.length > 0)
      bottom.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, [
    messages.length,
    messages.at(-1)?.content,
    messages.at(-1)?.tools.length,
    messages.at(-1)?.status,
    nearBottom,
  ]);
  useEffect(() => {
    setNearBottom(true);
    if (!cid) scroller.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [cid]);
  async function send(prompt: string, attachments: Attachment[]) {
    setStarting(true);
    try {
      let id = cid;
      if (!conversation) {
        id = await services.conversations.create(model);
        select(id);
      }
      await services.execution.run(id, prompt, model, attachments);
      setNearBottom(true);
    } finally {
      setStarting(false);
    }
  }
  return (
    <section className="gbot-chat" aria-label="G-Bot conversation">
      <div className="chat-model-row">
        <ModelSelector />
        <div className="row">
          <span className="health-dot" />
          <span className="tiny muted">
            {models.length ? "Ready to help" : "Connect your AI"}
          </span>
        </div>
      </div>
      <div
        className="message-scroll"
        ref={scroller}
        onScroll={() => {
          const el = scroller.current;
          if (el)
            setNearBottom(
              el.scrollHeight - el.scrollTop - el.clientHeight < 100,
            );
        }}
      >
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <div className="welcome-mark">
              <Logo />
              <span className="welcome-spark">
                <Sparkle size={14} weight="fill" />
              </span>
            </div>
            <span className="eyebrow">LESS BUSYWORK. MORE POSSIBILITY.</span>
            <h1>What can we get done?</h1>
            <p>
              One request. The right apps.
              <br />A little more room in your day.
            </p>
            <div className="prompt-cards">
              {prompts.map((p) => (
                <button
                  className="prompt-card"
                  key={p.title}
                  onClick={() => {
                    setDraft(cid, p.prompt);
                    document
                      .querySelector<HTMLTextAreaElement>(
                        '[aria-label="Message G-Bot"]',
                      )
                      ?.focus();
                  }}
                >
                  <div className="row">
                    <span className="prompt-icon">
                      <p.icon size={20} />
                    </span>
                    <strong>{p.title}</strong>
                    <ArrowUpRight size={16} />
                  </div>
                  <p>{p.description}</p>
                  <div className="prompt-tags">
                    {p.tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
            <div className="welcome-foot">
              <ShieldCheck size={15} />
              <span>G-Bot asks before taking action. Always.</span>
            </div>
          </div>
        ) : (
          <div className="messages">
            {messages.map((m) => (
              <MessageView key={m.id} message={m} cid={cid} />
            ))}
          </div>
        )}
        <div ref={bottom} />
      </div>
      {!nearBottom && messages.length > 0 && (
        <Button
          className="scroll-bottom"
          size="icon"
          aria-label="Scroll to latest message"
          onClick={() => {
            setNearBottom(true);
            bottom.current?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <ArrowDown size={17} />
        </Button>
      )}
      <div className="sr-only" role="status" aria-live="polite">
        {running
          ? "G-Bot is working."
          : pending
            ? "An action is waiting for your approval."
            : messages.at(-1)?.status === "failed"
              ? "The task paused. Review the error and retry."
              : "G-Bot is ready."}
      </div>
      <ChatComposer
        running={running}
        pendingApproval={pending}
        onSend={send}
        onStop={() => services.execution.stop(cid)}
      />
      {action.error && <ErrorState message={action.error.message} />}
    </section>
  );
}
function MessageView({ message: m, cid }: { message: Message; cid: string }) {
  const { data } = useSnapshot(),
    action = useAction();
  const [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState("");
  const setDraft = useWorkspace((s) => s.setDraft);
  const approval = data?.approvals.find((a) => a.id === m.approvalId);
  return (
    <motion.article
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={`message ${m.role}`}
    >
      <div className="message-avatar">
        {m.role === "assistant" ? (
          <Logo small />
        ) : (
          <span className="avatar">You</span>
        )}
      </div>
      <div className="message-main">
        <div className="message-meta">
          <strong>{m.role === "assistant" ? "G-Bot" : "You"}</strong>
          <span>
            {new Date(m.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {m.role === "assistant" && <Badge>Demo</Badge>}
        </div>
        {m.attachments.length > 0 && (
          <div className="attachment-list">
            {m.attachments.map((a) => (
              <AttachmentChip key={a.id} attachment={a} />
            ))}
          </div>
        )}
        <ExecutionTimeline tools={m.tools} />
        {m.content && (
          <div className="markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children, ...props }) => (
                  <a {...props} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {m.content}
            </ReactMarkdown>
          </div>
        )}
        {m.status === "running" && !m.content && (
          <div className="thinking">
            <span />
            <span />
            <span />
            Getting the right context…
          </div>
        )}
        {approval && <ApprovalCard approval={approval} />}
        <div className="message-actions">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Copy message"
            onClick={() => {
              void navigator.clipboard
                .writeText(m.content)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                })
                .catch(() =>
                  setCopyError(
                    "Clipboard unavailable. Select the message text to copy it.",
                  ),
                );
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </Button>
          {m.role === "assistant" && (
            <>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Helpful response"
                aria-pressed={m.feedback === "up"}
                onClick={() =>
                  void action.mutateAsync(() =>
                    services.conversations.feedback(cid, m.id, "up"),
                  )
                }
              >
                <ThumbsUp
                  size={15}
                  weight={m.feedback === "up" ? "fill" : "regular"}
                />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Unhelpful response"
                aria-pressed={m.feedback === "down"}
                onClick={() =>
                  void action.mutateAsync(() =>
                    services.conversations.feedback(cid, m.id, "down"),
                  )
                }
              >
                <ThumbsDown
                  size={15}
                  weight={m.feedback === "down" ? "fill" : "regular"}
                />
              </Button>
              {["failed", "cancelled", "completed"].includes(m.status) &&
                !approval &&
                data?.conversations.find((c) => c.id === cid)?.messages.at(-1)
                  ?.id === m.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void action
                        .mutateAsync(() => services.execution.retry(cid))
                        .catch(() => {})
                    }
                  >
                    <ArrowClockwise size={14} />
                    {m.status === "completed"
                      ? "Regenerate"
                      : "Retry remaining steps"}
                  </Button>
                )}
            </>
          )}
          {copied && (
            <span className="tiny muted" role="status">
              Copied
            </span>
          )}
        </div>
        {m.role === "assistant" &&
          m.status === "completed" &&
          !approval &&
          m.content.includes("Prepared response") && (
            <Button
              size="sm"
              onClick={() =>
                setDraft(cid, "Send the prepared response to the customer.")
              }
            >
              <EnvelopeSimple size={15} />
              Send this response
              <ArrowRight size={14} />
            </Button>
          )}
        {copyError && <ErrorState message={copyError} />}{" "}
        {action.error && <ErrorState message={action.error.message} />}
      </div>
    </motion.article>
  );
}
