"use client";

import { useState, useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import ChatSidebar from "./chat-sidebar";
import TranslatorScreen from "./translator-screen";
import type { Chat, TranscriptItem, BottomMode } from "./types";

// generate an ID for a new chat window
function makeId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())
  ).toString();
}

async function translateViaApi(args: {
  text: string;
  fromLang: string;
  toLang: string;
  model?: string;
}) {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? "Translation failed.");
  return data as { translation: string; serverMs?: number; model?: string };
}

export default function TranslatorShell() {
  const [fromLang, setFromLang] = useState("English");
  const [toLang, setToLang] = useState("Chinese");
  const [mode, setMode] = useState<BottomMode>("text");
  const [translationMs, setTranslationMs] = useState<number | null>(null); // shows latest translation time in header
  const firstChatId = useMemo(() => makeId(), []);
  // TODO: fix Date.now impure function
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

  function swapLanguages() {
    setFromLang((prev) => {
      setToLang(prev);
      return toLang;
    });
  }

  function newChat() {
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
    setActiveChatId(id);
    setTranslationMs(null);
    setSidebarOpen(false);
  }

  async function onSendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    // optimistic item
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

    // title update
    setChats((prev) =>
      prev
        .map((c) => {
          if (c.id !== activeChatId) return c;
          const title = c.title === "New chat" ? trimmed.slice(0, 28) : c.title;
          return { ...c, title, updatedAt: Date.now() };
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)
    );

    const t0 = performance.now();
    try {
      const data = await translateViaApi({
        text: trimmed,
        fromLang,
        toLang,
        model: "llama-3.3-70b-versatile",
      });

      const clientMs = performance.now() - t0;
      const ms = Math.round(data.serverMs ?? clientMs);
      setTranslationMs(ms);

      setMessagesByChat((prev) => ({
        ...prev,
        [activeChatId]: (prev[activeChatId] ?? []).map((m) =>
          m.id === pendingId
            ? {
                ...m,
                translatedText: data.translation,
                showPlayForTranslation: true,
                pending: false,
                latencyMs: ms,
              }
            : m
        ),
      }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setMessagesByChat((prev) => ({
        ...prev,
        [activeChatId]: (prev[activeChatId] ?? []).map((m) =>
          m.id === pendingId
            ? {
                ...m,
                translatedText: "Failed to translate.",
                pending: false,
                error: e?.message ?? "Failed to translate.",
              }
            : m
        ),
      }));
    }
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
            />
          </main>
        </Sheet>
      </div>
    </div>
  );
}
