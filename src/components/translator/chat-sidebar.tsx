"use client";

import { MessageSquare, SquarePen, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { Chat } from "./types";
import LogoutButton from "../ui/logout-button";
import ProlingualLogo from "./logo";

type Props = {
  chats: Chat[];
  activeChatId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
};

export default function ChatSidebar({
  chats,
  activeChatId,
  onSelect,
  onNewChat,
  onDeleteChat
}: Props) {

  return (
    <div className="flex h-full flex-col">

      <div className="p-3 flex justify-left">
        <ProlingualLogo variant="default" className="text-3xl" />
      </div>

      <div className="flex items-center justify-between gap-2 px-3">
        <div className="text-md font-medium">Chats</div>
      </div>


      <Button
        variant="secondary"
        className="m-3 rounded-xl justify-center"
        onClick={onNewChat}
      >
        <SquarePen className="mr-2 h-4 w-4" />
        New chat
      </Button>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {chats.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group relative flex items-center gap-2 rounded-xl px-3 py-2",
                "hover:bg-muted",
                c.id === activeChatId && "bg-muted"
              )}
            >
              <button
                onClick={() => onSelect(c.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
              >
                <MessageSquare className="h-4 w-4 shrink-0 opacity-70" />
                <span className="line-clamp-1">{c.title}</span>
              </button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  if (confirm("Are you sure you want to delete this chat?")) {
                    e.stopPropagation();
                    onDeleteChat(c.id);
                  }
                }}
                aria-label="Delete chat"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
      <Separator />
      <LogoutButton
        className="m-3"
        onError={(msg) => {
          // optional: show alert/toast in the sidebar
          console.log(msg);
        }}
      />

      <div className="p-3 text-xs text-muted-foreground">
        Tip: first message becomes the title.
      </div>
    </div>
  );
}
