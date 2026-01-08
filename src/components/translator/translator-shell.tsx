"use client";

import { useState, useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import ChatSidebar from "./chat-sidebar";
import TranslatorScreen from "./translator-screen";
import type { Chat, TranscriptItem, BottomMode } from "./types";

function makeId() {
  return (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random())).toString();
}

async function fakeTranslate(text: string, _from: string, to: string) {
  await new Promise((r) => setTimeout(r, 120 + Math.random() * 160));
  return `[${to}] ${text}`;
}

export default function TranslatorShell() {
  const [fromLang, setFromLang] = useState("English");
  const [toLang, setToLang] = useState("Chinese");
  const [mode, setMode] = useState<BottomMode>("text");
  const [translationMs, setTranslationMs] = useState<number | null>(null);

  const firstChatId = useMemo(() => makeId(), []);
  // TODO: fix Date.now impure function
  const [chats, setChats] = useState<Chat[]>([
    { id: firstChatId, title: "New chat", updatedAt: Date.now() },
  ]);
  const [activeChatId, setActiveChatId] = useState(firstChatId);

  const [messagesByChat, setMessagesByChat] = useState<Record<string, TranscriptItem[]>>({
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
    setChats((prev) => [{ id, title: "New chat", updatedAt: Date.now() }, ...prev]);
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

    const start = performance.now();
    const translated = await fakeTranslate(trimmed, fromLang, toLang);
    const ms = performance.now() - start;
    setTranslationMs(ms);

    const item: TranscriptItem = {
      id: makeId(),
      sourceLanguage: fromLang,
      sourceText: trimmed,
      translatedText: translated,
      showPlayForTranslation: true,
    };

    setMessagesByChat((prev) => ({
      ...prev,
      [activeChatId]: [...(prev[activeChatId] ?? []), item],
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
