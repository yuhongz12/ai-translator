"use client";

import { Languages, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TranscriptItem } from "./types";

export default function MessageItem({ item }: { item: TranscriptItem }) {
  return (
    <div className="space-y-2">
      {/* Language label */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted">
          <Languages className="h-3.5 w-3.5" />
        </span>
        <span>{item.sourceLanguage}</span>
      </div>

      {/* Source text */}
      <p className="text-sm leading-relaxed">{item.sourceText}</p>

      {/* Translation row with play button (like screenshot) */}
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
              onClick={() => {
                // Hook up audio playback here
              }}
            >
              <Play className="h-4 w-4" />
            </Button>
          ) : null}

          <p className="text-sm leading-relaxed text-foreground">{item.translatedText}</p>
        </div>
      ) : null}
    </div>
  );
}
