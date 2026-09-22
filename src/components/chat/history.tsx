"use client";
import { useState } from "react";
import {
  MagnifyingGlass,
  ChatCircle,
  Trash,
  PencilSimple,
} from "@phosphor-icons/react";
import { services } from "@/services";
import { useAction, useSnapshot } from "@/hooks/use-services";
import { useWorkspace } from "@/stores/workspace";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Empty, Badge } from "@/components/common/ui";
export function ConversationHistory({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data } = useSnapshot(),
    action = useAction();
  const selected = useWorkspace((s) => s.conversationId),
    select = useWorkspace((s) => s.setConversation);
  const [search, setSearch] = useState(""),
    [edit, setEdit] = useState(""),
    [name, setName] = useState(""),
    [remove, setRemove] = useState("");
  const list =
    data?.conversations.filter((c) =>
      c.title.toLowerCase().includes(search.toLowerCase()),
    ) || [];
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Your conversations"
        description="Pick up where you left off. History is saved in this browser."
        wide
      >
        <div className="history-search row">
          <MagnifyingGlass size={18} />
          <input
            aria-label="Search conversations"
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {list.length ? (
          Array.from(
            new Set(
              list.map((c) => new Date(c.updatedAt).toLocaleDateString()),
            ),
          ).map((date) => (
            <section key={date}>
              <h3 className="eyebrow history-date">
                {date === new Date().toLocaleDateString() ? "Today" : date}
              </h3>
              {list
                .filter(
                  (c) => new Date(c.updatedAt).toLocaleDateString() === date,
                )
                .map((c) => (
                  <div
                    className={`history-row ${selected === c.id ? "active" : ""}`}
                    key={c.id}
                  >
                    <ChatCircle size={19} />
                    <button
                      className="grow history-title"
                      onClick={() => {
                        select(c.id);
                        onOpenChange(false);
                      }}
                    >
                      <strong>{c.title}</strong>
                      <span>
                        {data?.providers
                          .flatMap((p) => p.models)
                          .find((m) => m.id === c.model)?.name ||
                          "Saved model"}{" "}
                        · {c.messages.length} messages
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Rename ${c.title}`}
                      onClick={() => {
                        setEdit(c.id);
                        setName(c.title);
                      }}
                    >
                      <PencilSimple size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${c.title}`}
                      onClick={() => setRemove(c.id)}
                    >
                      <Trash size={16} />
                    </Button>
                  </div>
                ))}
            </section>
          ))
        ) : (
          <Empty
            title={search ? "No conversations match" : "A fresh start"}
            description={
              search
                ? "Try another search term."
                : "Your conversations will appear here after your first request."
            }
          />
        )}
      </Dialog>
      <Dialog
        open={!!edit}
        onOpenChange={() => setEdit("")}
        title="Rename conversation"
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void action
              .mutateAsync(() => services.conversations.rename(edit, name))
              .then(() => setEdit(""));
          }}
        >
          <label className="field">
            Conversation title
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <Button variant="default" type="submit">
            Save title
          </Button>
        </form>
      </Dialog>
      <Dialog
        open={!!remove}
        onOpenChange={() => setRemove("")}
        title="Delete this conversation?"
        description="Messages and pending approvals will be removed. Activity audit entries are retained."
      >
        <div className="form-actions">
          <Button onClick={() => setRemove("")}>Keep conversation</Button>
          <Button
            variant="destructive"
            onClick={() =>
              void action
                .mutateAsync(() => services.conversations.remove(remove))
                .then(() => {
                  if (selected === remove) select("");
                  setRemove("");
                })
            }
          >
            Delete conversation
          </Button>
        </div>
      </Dialog>
    </>
  );
}
