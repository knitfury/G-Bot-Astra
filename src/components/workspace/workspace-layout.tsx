"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  SidebarSimple,
  ClockCounterClockwise,
  ArrowsOutSimple,
  Plus,
  CaretRight,
} from "@phosphor-icons/react";
import { useWorkspace } from "@/stores/workspace";
import { useSnapshot } from "@/hooks/use-services";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Logo, Badge } from "@/components/common/ui";
import { BusinessAppPane } from "./business-app-pane";
import { GBotChat } from "@/components/chat/gbot-chat";
import { ConversationHistory } from "@/components/chat/history";
function ResizeHandle({ side }: { side: "left" | "right" }) {
  const width = useWorkspace((s) => s[side].width),
    setPane = useWorkspace((s) => s.setPane);
  return (
    <div
      className="pane-resizer"
      role="separator"
      tabIndex={0}
      aria-label={`Resize ${side} pane`}
      aria-orientation="vertical"
      aria-valuemin={240}
      aria-valuemax={360}
      aria-valuenow={width}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const delta =
            (e.key === "ArrowRight" ? 10 : -10) * (side === "left" ? 1 : -1);
          setPane(side, { width: Math.min(360, Math.max(240, width + delta)) });
        }
      }}
      onPointerDown={(e) => {
        const start = e.clientX;
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
        const move = (event: PointerEvent) =>
          setPane(side, {
            width: Math.min(
              360,
              Math.max(
                240,
                width + (event.clientX - start) * (side === "left" ? 1 : -1),
              ),
            ),
          });
        const up = () => {
          target.removeEventListener("pointermove", move);
          target.removeEventListener("pointerup", up);
        };
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", up);
      }}
    />
  );
}
export function WorkspaceLayout() {
  const { data } = useSnapshot();
  const left = useWorkspace((s) => s.left),
    right = useWorkspace((s) => s.right),
    cid = useWorkspace((s) => s.conversationId),
    setPane = useWorkspace((s) => s.setPane);
  const [history, setHistory] = useState(false),
    [drawer, setDrawer] = useState<"left" | "right" | null>(null),
    [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = matchMedia("(max-width: 1100px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const conversation = data?.conversations.find((c) => c.id === cid);
  return (
    <div className="workspace">
      <div className="workspace-toolbar">
        <div className="row grow">
          <span className="workspace-icon">
            <Logo small />
          </span>
          <strong>{conversation?.title || "A fresh conversation"}</strong>
          <span className="workspace-subtitle">Your business copilot</span>
        </div>
        <div className="row">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Conversation history"
            title="Conversation history"
            onClick={() => setHistory(true)}
          >
            <ClockCounterClockwise size={19} />
          </Button>
          <span className="toolbar-divider" />
          <Button
            size="icon"
            variant="ghost"
            aria-label="Toggle left pane"
            title="Toggle left app pane"
            aria-pressed={left.enabled}
            onClick={() =>
              narrow
                ? setDrawer("left")
                : setPane("left", { enabled: !left.enabled })
            }
          >
            <SidebarSimple
              size={19}
              weight={left.enabled ? "duotone" : "regular"}
            />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Toggle right pane"
            title="Toggle right app pane"
            aria-pressed={right.enabled}
            onClick={() =>
              narrow
                ? setDrawer("right")
                : setPane("right", { enabled: !right.enabled })
            }
          >
            <SidebarSimple
              size={19}
              style={{ transform: "scaleX(-1)" }}
              weight={right.enabled ? "duotone" : "regular"}
            />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="G-Bot only mode"
            title="G-Bot only mode"
            onClick={() => {
              setPane("left", { enabled: false });
              setPane("right", { enabled: false });
              setDrawer(null);
            }}
          >
            <ArrowsOutSimple size={18} />
          </Button>
        </div>
      </div>
      <motion.div
        layout
        className="workspace-columns"
        transition={{ type: "spring", stiffness: 320, damping: 35 }}
      >
        {left.enabled && !narrow && (
          <>
            <BusinessAppPane side="left" />
            <ResizeHandle side="left" />
          </>
        )}
        <motion.div layout className="chat-container">
          <GBotChat />
        </motion.div>
        {right.enabled && !narrow && (
          <>
            <ResizeHandle side="right" />
            <BusinessAppPane side="right" />
          </>
        )}
      </motion.div>
      <ConversationHistory open={history} onOpenChange={setHistory} />
      <Dialog
        open={!!drawer}
        onOpenChange={() => setDrawer(null)}
        title={`${drawer === "left" ? "Left" : "Right"} app context`}
        description="The same business context, alongside your conversation."
      >
        {drawer && (
          <BusinessAppPane
            side={drawer}
            mobile
            onClose={() => setDrawer(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
