"use client";

import { Languages, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TranscriptItem } from "./types";

export default function MessageItem({ item }: { item: TranscriptItem }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted">
          <Languages className="h-3.5 w-3.5" />
        </span>
        <span>{item.sourceLanguage}</span>
        {item.latencyMs != null ? <span>• {item.latencyMs} ms</span> : null}
      </div>

      <p className="text-sm leading-relaxed">{item.sourceText}</p>

      {item.translatedText ? (
        <div className="flex items-start gap-2 pt-1">
          {item.showPlayForTranslation ? (
            <Button
              type="button"
              size="icon"
              className={cn(
                "h-8 w-8 rounded-full",
                "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
              aria-label="Play translation"
              onClick={() => {}}
            >
              <Play className="h-4 w-4" />
            </Button>
          ) : null}

          <p
            className={cn(
              "text-sm leading-relaxed",
              item.pending && "opacity-70",
              item.error && "text-destructive"
            )}
          >
            {item.translatedText}
          </p>
        </div>
      ) : null}
    </div>
  );
}
