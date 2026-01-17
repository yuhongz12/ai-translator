"use client";

import { useEffect, useRef, useState } from "react";
import LanguageHeader from "./language-header";
import MessageList from "./message-list";
import BottomBar from "./bottom-bar";
import type { BottomMode, TranscriptItem } from "./types";

type Props = {
  fromLang: string;
  toLang: string;
  mode: BottomMode;
  translationMs: number | null;

  onChangeFrom: (v: string) => void;
  onChangeTo: (v: string) => void;
  onSwap: () => void;
  onToggleMode: (m: BottomMode) => void;

  onOpenSidebar: () => void;

  messages: TranscriptItem[];
  onSendText: (text: string) => Promise<void>;
  onSendFile: (file: File) => Promise<void>;

  onAttachFiles: (files: File[]) => Promise<void>;
  attachments?: { id: string; name: string; status: "uploading" | "ready" | "error" }[];
  onRemoveAttachment?: (id: string) => void;

  sendLocked: boolean;
};

export default function TranslatorScreen(props: Props) {
  const [input, setInput] = useState("");

  async function onSend() {
    const text = input;
    setInput("");
    await props.onSendText(text);
  }

  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Scroll when a new message is appended (send/file/etc)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [props.messages.length]);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Top bar (sticky like ChatGPT) */}
      <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto w-full max-w-3xl px-3 py-3 sm:px-6">
          <LanguageHeader
            fromLang={props.fromLang}
            toLang={props.toLang}
            mode={props.mode}
            translationMs={props.translationMs}
            onChangeFrom={props.onChangeFrom}
            onChangeTo={props.onChangeTo}
            onSwap={props.onSwap}
            onToggleMode={props.onToggleMode}
            onOpenSidebar={props.onOpenSidebar}
          />
        </div>
      </div>

      {/* Messages (centered column like ChatGPT desktop) */}
      <div className="flex-1 overflow-hidden mt-6">
        <div className="mx-auto h-full w-full max-w-3xl px-3 sm:px-6">
          <MessageList items={props.messages} bottomRef={bottomRef} />
        </div>
      </div>

      {/* Composer (sticky bottom, iOS-friendly) */}
      <div className="sticky bottom-0 border-t bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto w-full max-w-3xl px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <BottomBar
            mode={props.mode}
            input={input}
            onInputChange={setInput}
            onSend={onSend}
            onMic={() => props.onToggleMode("voice")}
            onStop={() => props.onToggleMode("text")}
            onAttachFiles={props.onAttachFiles}
            attachments={props.attachments}
            onRemoveAttachment={props.onRemoveAttachment}
            sendLocked={props.sendLocked}
          />
        </div>
      </div>
    </div>
  );
}
