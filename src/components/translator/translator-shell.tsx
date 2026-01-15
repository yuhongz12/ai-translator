"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useCompletion } from "@ai-sdk/react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import ChatSidebar from "./chat-sidebar";
import TranslatorScreen from "./translator-screen";
import type { Chat, TranscriptItem, BottomMode } from "./types";

function makeId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())
  ).toString();
}

type StreamTarget = {
  chatId: string;
  messageId: string;
  startedAt: number;
};

export default function TranslatorShell() {
  const [fromLang, setFromLang] = useState("English");
  const [toLang, setToLang] = useState("Chinese");
  const [mode, setMode] = useState<BottomMode>("text");
  const [translationMs, setTranslationMs] = useState<number | null>(null);

  const firstChatId = useMemo(() => makeId(), []);
  const [chats, setChats] = useState<Chat[]>([
    { id: firstChatId, title: "New chat", updatedAt: Date.now() },
  ]);
  const [activeChatId, setActiveChatId] = useState(firstChatId);

  const [messagesByChat, setMessagesByChat] = useState<
    Record<string, TranscriptItem[]>
  >({
    [firstChatId]: [],
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messages = messagesByChat[activeChatId] ?? [];

  const [streamTarget, setStreamTarget] = useState<StreamTarget | null>(null);
  const streamTargetRef = useRef<StreamTarget | null>(null);

  const {
    completion,
    complete,
    isLoading,
    stop,
    setCompletion,
  } = useCompletion({
    api: "/api/translate",
    // You are using toUIMessageStreamResponse(), so keep the default streamProtocol = 'data'. :contentReference[oaicite:2]{index=2}
    experimental_throttle: 40, // reduces re-render frequency during streaming :contentReference[oaicite:3]{index=3}

    onFinish: (_prompt, finalText) => {
      const target = streamTargetRef.current;
      if (!target) return;

      const ms = Math.round(performance.now() - target.startedAt);
      setTranslationMs(ms);

      setMessagesByChat((prev) => ({
        ...prev,
        [target.chatId]: (prev[target.chatId] ?? []).map((m) =>
          m.id === target.messageId
            ? {
                ...m,
                translatedText: finalText.trim() || "",
                showPlayForTranslation: true,
                pending: false,
                latencyMs: ms,
              }
            : m
        ),
      }));

      setStreamTarget(null);
      streamTargetRef.current = null;
    },

    onError: (err) => {
      const target = streamTargetRef.current;
      if (!target) return;

      setMessagesByChat((prev) => ({
        ...prev,
        [target.chatId]: (prev[target.chatId] ?? []).map((m) =>
          m.id === target.messageId
            ? {
                ...m,
                translatedText: "Failed to translate.",
                pending: false,
                error: err?.message ?? "Failed to translate.",
              }
            : m
        ),
      }));

      setStreamTarget(null);
      streamTargetRef.current = null;
    },
  });

  // Stream updates: write the current `completion` into the pending message.
  useEffect(() => {
    if (!streamTarget) return;

    setMessagesByChat((prev) => ({
      ...prev,
      [streamTarget.chatId]: (prev[streamTarget.chatId] ?? []).map((m) =>
        m.id === streamTarget.messageId
          ? {
              ...m,
              translatedText: completion || "Translating…",
              // keep pending true until onFinish flips it
              pending: true,
              showPlayForTranslation: false,
            }
          : m
      ),
    }));
  }, [completion, streamTarget]);

  function swapLanguages() {
    setFromLang((prev) => {
      setToLang(prev);
      return toLang;
    });
  }

  function newChat() {
    // optional: stop current stream when starting new chat
    if (isLoading) stop();

    const id = makeId();
    setChats((prev) => [
      { id, title: "New chat", updatedAt: Date.now() },
      ...prev,
    ]);
    setMessagesByChat((prev) => ({ ...prev, [id]: [] }));
    setActiveChatId(id);
    setTranslationMs(null);
    setSidebarOpen(false);
  }

  function selectChat(id: string) {
    // optional: stop current stream when switching chats
    if (isLoading) stop();

    setActiveChatId(id);
    setTranslationMs(null);
    setSidebarOpen(false);
  }

  async function onSendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    // If you only want 1 in-flight translation at a time:
    if (isLoading) stop();

    const pendingId = makeId();
    const pendingItem: TranscriptItem = {
      id: pendingId,
      sourceLanguage: fromLang,
      sourceText: trimmed,
      translatedText: "Translating…",
      showPlayForTranslation: false,
      pending: true,
    };

    setMessagesByChat((prev) => ({
      ...prev,
      [activeChatId]: [...(prev[activeChatId] ?? []), pendingItem],
    }));

    setChats((prev) =>
      prev
        .map((c) => {
          if (c.id !== activeChatId) return c;
          const title = c.title === "New chat" ? trimmed.slice(0, 28) : c.title;
          return { ...c, title, updatedAt: Date.now() };
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)
    );

    setTranslationMs(null);
    setCompletion(""); // clear previous stream output
    const target: StreamTarget = {
      chatId: activeChatId,
      messageId: pendingId,
      startedAt: performance.now(),
    };
    setStreamTarget(target);
    streamTargetRef.current = target;

    // Start streaming. `complete` kicks off a request; stream updates land in `completion`. :contentReference[oaicite:4]{index=4}
    complete(trimmed, {
      body: {
        // keep sending the full payload your route expects:
        text: trimmed,
        fromLang,
        toLang,
        model: "llama-3.3-70b-versatile",
      },
    });
  }

  return (
    <div className="h-dvh bg-background">
      <div className="flex h-full">
        {/* Desktop sidebar */}
        <aside className="hidden w-80 border-r bg-muted/20 md:block">
          <ChatSidebar
            chats={chats}
            activeChatId={activeChatId}
            onSelect={selectChat}
            onNewChat={newChat}
          />
        </aside>

        {/* Mobile sidebar */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[320px] p-0 md:hidden">
            <SheetHeader className="sr-only">
              <SheetTitle>Chat history</SheetTitle>
              <SheetDescription>Your saved translation chats</SheetDescription>
            </SheetHeader>
            <ChatSidebar
              chats={chats}
              activeChatId={activeChatId}
              onSelect={selectChat}
              onNewChat={newChat}
            />
          </SheetContent>

          {/* Main chat fills screen */}
          <main className="flex h-full flex-1">
            <TranslatorScreen
              fromLang={fromLang}
              toLang={toLang}
              mode={mode}
              translationMs={translationMs}
              onChangeFrom={setFromLang}
              onChangeTo={setToLang}
              onSwap={swapLanguages}
              onToggleMode={setMode}
              onOpenSidebar={() => setSidebarOpen(true)}
              messages={messages}
              onSendText={onSendText}
              // optionally pass these down if you want a stop button in TranslatorScreen
              // isLoading={isLoading}
              // onStop={stop}
            />
          </main>
        </Sheet>
      </div>
    </div>
  );
}
