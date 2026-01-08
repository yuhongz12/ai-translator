"use client";

import { Mic, Paperclip, SendHorizontal, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Waveform from "./waveform";
import type { BottomMode } from "./types";

type Props = {
  mode: BottomMode;
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onMic: () => void;
  onStop: () => void;

  // optional hooks you can wire later
  onAttach?: () => void;
};

export default function BottomBar({
  mode,
  input,
  onInputChange,
  onSend,
  onMic,
  onStop,
  onAttach,
}: Props) {
  if (mode === "voice") {
    return (
      <div className="flex items-center gap-3">
        <div className="flex h-12 flex-1 items-center justify-between rounded-2xl bg-muted px-4">
          <Waveform />
        </div>
        <Button
          type="button"
          size="icon"
          className="h-12 w-12 rounded-2xl"
          onClick={onStop}
          aria-label="Stop"
        >
          <Square className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  const canSend = input.trim().length > 0;

  return (
    <div className="flex items-end gap-2">
      {/* Left controls */}
      <div className="flex items-center gap-2 pb-1">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-11 w-11 rounded-2xl"
          onClick={onAttach}
          aria-label="Add files"
        >
          <Paperclip className="h-5 w-5" />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-11 w-11 rounded-2xl"
          onClick={onMic}
          aria-label="Voice"
        >
          <Mic className="h-5 w-5" />
        </Button>
      </div>

      {/* Text input */}
      <div className="flex-1">
        <Textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Message…"
          className="min-h-12 resize-none rounded-2xl"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
        />
      </div>

      {/* Send */}
      <div className="pb-1">
        <Button
          type="button"
          size="icon"
          className="h-11 w-11 rounded-2xl"
          onClick={onSend}
          aria-label="Send"
          disabled={!canSend}
        >
          <SendHorizontal className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
