import { Fragment } from "react/jsx-runtime";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import MessageItem from "./message-item";
import type { TranscriptItem } from "./types";

export default function MessageList({ items }: { items: TranscriptItem[] }) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 pb-4">
        {items.map((it, idx) => (
          <Fragment key={it.id}>
            <MessageItem item={it} />
            {idx < items.length - 1 ? (
              <Separator className="opacity-60" />
            ) : null}
          </Fragment>
        ))}
      </div>
    </ScrollArea>
  );
}
