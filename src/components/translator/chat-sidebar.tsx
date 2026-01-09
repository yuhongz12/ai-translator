"use client";

import { MessageSquare, SquarePen } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { Chat } from "./types";

type Props = {
  chats: Chat[];
  activeChatId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
};

export default function ChatSidebar({
  chats,
  activeChatId,
  onSelect,
  onNewChat,
}: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="text-sm font-medium">Chats</div>
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
        <div className="p-2">
          {chats.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm",
                "hover:bg-muted",
                c.id === activeChatId && "bg-muted"
              )}
            >
              <MessageSquare className="h-4 w-4 shrink-0 opacity-70" />
              <span className="line-clamp-1">{c.title}</span>
            </button>
          ))}
        </div>
      </ScrollArea>

      <div className="p-3 text-xs text-muted-foreground">
        Tip: first message becomes the title.
      </div>
    </div>
  );
}
