"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useCompletion } from "@ai-sdk/react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import ChatSidebar from "./chat-sidebar";
import TranslatorScreen from "./translator-screen";
import type { Chat, TranscriptItem, BottomMode } from "./types";

import { createClient } from "@/lib/supabase/client";

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

type Attachment = {
  id: string;
  name: string;
  status: "uploading" | "ready" | "error";
  mime: string;
  size: number;
  chars?: number;
  error?: string;
};

type ExtractResult = {
  text: string;
  filename: string;
  mime: string;
  chars: number;
};

async function extractTextViaApi(file: File): Promise<ExtractResult> {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch("/api/extract-text", { method: "POST", body: fd });

  // Be defensive: not all failures return JSON
  const ct = res.headers.get("content-type") ?? "";
  let data: any = {};
  try {
    if (ct.includes("application/json")) data = await res.json();
    else data = { error: await res.text() };
  } catch {
    data = {};
  }

  if (!res.ok) {
    const msg =
      data?.error ??
      (typeof data === "string" ? data : null) ??
      `Extract failed (${res.status})`;
    throw new Error(msg);
  }

  return data as ExtractResult;
}

type DBChatRow = {
  id: string;
  title: string;
  updated_at: string;
};

type DBMessageRow = {
  id: string;
  chat_id: string;
  source_language: string | null;
  target_language: string | null;
  source_text: string;
  translated_text: string | null;
  model: string | null;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
};

function mapChat(row: DBChatRow): Chat {
  return {
    id: row.id,
    title: row.title ?? "New chat",
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

function mapMessage(row: DBMessageRow): TranscriptItem {
  return {
    id: row.id,
    sourceLanguage: row.source_language ?? "",
    sourceText: row.source_text ?? "",
    translatedText: row.translated_text ?? "",
    pending: row.translated_text === "Translating…" || !row.translated_text,
    showPlayForTranslation: Boolean(row.translated_text && row.translated_text !== "Translating…"),
    latencyMs: row.latency_ms ?? undefined,
    error: row.error ?? undefined,
  };
}

export default function TranslatorShell() {
  // Create a single browser client instance for this component lifecycle.
  const supabase = useMemo(() => createClient(), []);

  const [fromLang, setFromLang] = useState("English");
  const [toLang, setToLang] = useState("Chinese");
  const [mode, setMode] = useState<BottomMode>("text");
  const [translationMs, setTranslationMs] = useState<number | null>(null);

  // App-level errors (auth/db load)
  const [appError, setAppError] = useState<string | null>(null);

  // File failure alert state (accumulates messages until dismissed)
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const pushUploadError = useCallback((msg: string) => {
    setUploadErrors((prev) => [...prev, msg]);
  }, []);
  useEffect(() => {
    if (uploadErrors.length === 0) return;

    const t = window.setTimeout(() => {
      setUploadErrors([]);
    }, 3000);

    return () => window.clearTimeout(t);
  }, [uploadErrors.length, setUploadErrors]);

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

  // Which message is currently receiving stream updates?
  const [streamTarget, setStreamTarget] = useState<StreamTarget | null>(null);
  const streamTargetRef = useRef<StreamTarget | null>(null);

  // Attachments shown in UI while files are being processed
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isUploading = attachments.some((a) => a.status === "uploading");

  // Counts how many files are currently being processed (extract + translate).
  const [fileQueueCount, setFileQueueCount] = useState(0);

  // While files are processing, we prevent sending textarea messages.
  const sendLocked = fileQueueCount > 0;


  /**
   * Promise bridge: useCompletion completes via callbacks, not returned promises.
   * We store a promise here so "send file A then file B" can wait/queue safely.
   */
  const inFlightRef = useRef<{
    messageId: string;
    done: Promise<void>;
    resolve: () => void;
    reject: (e: Error) => void;
  } | null>(null);

  const waitForSession = useCallback(async () => {
    // 1) try immediately
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;

    // 2) wait for hydration / auth event
    return await new Promise((resolve) => {
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          sub.subscription.unsubscribe();
          resolve(session);
        }
      });
    });
  }, [supabase]);

  // ---------- Supabase DB helpers ----------
  const requireUser = useCallback(async () => {
    await waitForSession();
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error("Not authenticated");
    return data.user;
  }, [supabase, waitForSession]);

  const dbListChats = useCallback(async () => {
    const { data, error } = await supabase
      .from("chats")
      .select("id,title,updated_at")
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as DBChatRow[];
  }, [supabase]);

  const dbCreateChat = useCallback(
    async (title = "New chat") => {
      const user = await requireUser();

      const { data, error } = await supabase
        .from("chats")
        .insert({
          user_id: user.id,
          title,
          // updated_at defaults in DB; ok to omit
        })
        .select("id,title,updated_at")
        .single();

      if (error) throw error;
      return data as DBChatRow;
    },
    [supabase, requireUser]
  );

  const dbListMessages = useCallback(
    async (chatId: string) => {
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id,chat_id,source_language,target_language,source_text,translated_text,model,latency_ms,error,created_at"
        )
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as DBMessageRow[];
    },
    [supabase]
  );

  const dbInsertMessage = useCallback(
    async (chatId: string, payload: Partial<DBMessageRow>) => {
      const user = await requireUser();

      const { data, error } = await supabase
        .from("messages")
        .insert({
          user_id: user.id,
          chat_id: chatId,
          ...payload,
        })
        .select(
          "id,chat_id,source_language,target_language,source_text,translated_text,model,latency_ms,error,created_at"
        )
        .single();

      if (error) throw error;
      return data as DBMessageRow;
    },
    [supabase, requireUser]
  );

  const dbUpdateMessage = useCallback(
    async (messageId: string, patch: Record<string, any>) => {
      const { error } = await supabase
        .from("messages")
        .update(patch)
        .eq("id", messageId);
      if (error) throw error;
    },
    [supabase]
  );

  const dbTouchChat = useCallback(
    async (chatId: string, patch?: { title?: string }) => {
      const body: Record<string, any> = {
        updated_at: new Date().toISOString(),
        ...(patch?.title ? { title: patch.title } : {}),
      };

      const { error } = await supabase.from("chats").update(body).eq("id", chatId);
      if (error) throw error;
    },
    [supabase]
  );

  async function dbDeleteChat(chatId: string) {
    const { error } = await supabase.from("chats").delete().eq("id", chatId);
    if (error) throw error;
  }


  // ---------- Load from DB on app start ----------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await waitForSession();
        setAppError(null);

        // If you enforce auth at the page/layout level, this should always succeed.
        await requireUser();

        const rows = await dbListChats();
        if (cancelled) return;

        // If no chats exist, create one.
        if (rows.length === 0) {
          const created = await dbCreateChat("New chat");
          if (cancelled) return;

          const chat = mapChat(created);
          setChats([chat]);
          setActiveChatId(chat.id);
          setMessagesByChat({ [chat.id]: [] });
          return;
        }

        const nextChats = rows.map(mapChat);
        setChats(nextChats);

        const firstId = nextChats[0].id;
        setActiveChatId(firstId);

        const msgRows = await dbListMessages(firstId);
        if (cancelled) return;

        setMessagesByChat({ [firstId]: msgRows.map(mapMessage) });
      } catch (e: any) {
        if (cancelled) return;
        setAppError(e?.message ?? "Failed to load chats.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requireUser, dbListChats, dbListMessages, dbCreateChat]);

  // ---------- Streaming ----------
  const { completion, complete, isLoading, stop, setCompletion } = useCompletion({
    api: "/api/translate",
    experimental_throttle: 40,

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

      // Persist: finalize message + touch chat
      void (async () => {
        try {
          await dbUpdateMessage(target.messageId, {
            translated_text: finalText.trim() || "",
            latency_ms: ms,
            error: null,
          });
          await dbTouchChat(target.chatId);
        } catch (e: any) {
          pushUploadError(`DB update failed: ${e?.message ?? "unknown error"}`);
        }
      })();

      // Resolve awaiting sender if it matches
      const inflight = inFlightRef.current;
      if (inflight?.messageId === target.messageId) {
        inflight.resolve();
        inFlightRef.current = null;
      }

      setStreamTarget(null);
      streamTargetRef.current = null;
    },
    onError: (err) => {
      const target = streamTargetRef.current;
      if (!target) return;

      const msg = err?.message ?? "Failed to translate.";

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

      // Persist: mark message error
      void (async () => {
        try {
          await dbUpdateMessage(target.messageId, {
            translated_text: "Failed to translate.",
            error: msg,
          });
          await dbTouchChat(target.chatId);
        } catch (e: any) {
          pushUploadError(`DB update failed: ${e?.message ?? "unknown error"}`);
        }
      })();

      // Reject awaiting sender if it matches
      const inflight = inFlightRef.current;
      if (inflight?.messageId === target.messageId) {
        inflight.reject(err instanceof Error ? err : new Error("Failed"));
        inFlightRef.current = null;
      }

      setStreamTarget(null);
      streamTargetRef.current = null;
    },
  });

  // Stream updates: write current `completion` into the pending message.
  useEffect(() => {
    if (!streamTarget) return;

    setMessagesByChat((prev) => ({
      ...prev,
      [streamTarget.chatId]: (prev[streamTarget.chatId] ?? []).map((m) =>
        m.id === streamTarget.messageId
          ? {
            ...m,
            translatedText: completion || "Translating…",
            pending: true,
            showPlayForTranslation: false,
          }
          : m
      ),
    }));
  }, [completion, streamTarget]);

  /**
   * Cancel any active stream + reject the in-flight promise (if any).
   * Used when user starts a new chat or sends a new typed message mid-stream.
   */
  const cancelInFlight = useCallback(
    (reason = "Canceled") => {
      if (isLoading) stop();

      const inflight = inFlightRef.current;
      if (inflight) {
        inflight.reject(new Error(reason));
        inFlightRef.current = null;
      }

      setStreamTarget(null);
      streamTargetRef.current = null;
      setCompletion("");
    },
    [isLoading, stop, setCompletion]
  );

  const swapLanguages = useCallback(() => {
    const currentTo = toLang;
    setToLang(fromLang);
    setFromLang(currentTo);
  }, [fromLang, toLang]);

  const newChat = useCallback(async () => {
    cancelInFlight("New chat");

    try {
      const created = await dbCreateChat("New chat");
      const chat = mapChat(created);

      setChats((prev) => [chat, ...prev]);
      setMessagesByChat((prev) => ({ ...prev, [chat.id]: [] }));
      setActiveChatId(chat.id);
      setTranslationMs(null);
      setSidebarOpen(false);
    } catch (e: any) {
      pushUploadError(`Failed to create chat: ${e?.message ?? "unknown error"}`);
    }
  }, [cancelInFlight, dbCreateChat, pushUploadError]);

  const selectChat = useCallback(
    async (id: string) => {
      cancelInFlight("Switched chat");

      setActiveChatId(id);
      setTranslationMs(null);
      setSidebarOpen(false);

      // If already loaded, don’t refetch.
      if (messagesByChat[id]) return;

      try {
        const rows = await dbListMessages(id);
        setMessagesByChat((prev) => ({ ...prev, [id]: rows.map(mapMessage) }));
      } catch (e: any) {
        pushUploadError(`Failed to load messages: ${e?.message ?? "unknown error"}`);
      }
    },
    [cancelInFlight, dbListMessages, messagesByChat, pushUploadError]
  );

  const onDeleteChat = useCallback(
  async (id: string) => {
    const deletingActive = id === activeChatId;

    // Decide what the next active chat should be (before we mutate state)
    const remaining = chats.filter((c) => c.id !== id);
    const nextActiveId = deletingActive ? (remaining[0]?.id ?? null) : activeChatId;

    if (deletingActive) cancelInFlight("Deleted chat");

    // ---- Optimistic UI updates ----
    setChats(remaining);

    setMessagesByChat((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    setTranslationMs(null);
    setSidebarOpen(false);

    // If we deleted the active chat, switch now
    if (deletingActive) {
      if (nextActiveId) {
        setActiveChatId(nextActiveId);

        // Load messages if not cached
        if (!messagesByChat[nextActiveId]) {
          try {
            const rows = await dbListMessages(nextActiveId);
            setMessagesByChat((prev) => ({
              ...prev,
              [nextActiveId]: rows.map(mapMessage),
            }));
          } catch (e: any) {
            pushUploadError(`Failed to load messages: ${e?.message ?? "unknown error"}`);
          }
        }
      } else {
        // Deleted the last chat -> create a new one
        try {
          const created = await dbCreateChat("New chat");
          const chat = mapChat(created);

          setChats([chat]);
          setActiveChatId(chat.id);
          setMessagesByChat({ [chat.id]: [] });
        } catch (e: any) {
          pushUploadError(`Failed to create chat: ${e?.message ?? "unknown error"}`);
        }
      }
    }

    // ---- Persist delete in DB (after UI stays responsive) ----
    try {
      await dbDeleteChat(id); // cascade delete messages or delete them first inside this function
    } catch (e: any) {
      pushUploadError(`Failed to delete chat: ${e?.message ?? "unknown error"}`);
      // Optional: refetch chats here if you want to fully recover UI.
    }
  },
  [
    activeChatId,
    chats,
    messagesByChat,
    cancelInFlight,
    dbDeleteChat,
    dbListMessages,
    dbCreateChat,
    pushUploadError,
  ]
);


  /**
   * Send text for translation.
   * - cancelInFlight = true: cancel current stream (typed send behavior)
   * - cancelInFlight = false: wait/queue behind current stream (file queue behavior)
   */
  const onSendText = useCallback(
    async (text: string, opts: { cancelInFlight?: boolean } = {}) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const cancel = opts.cancelInFlight ?? true;

      // Block typed sends while files are processing (file-triggered uses cancelInFlight:false)
      if (sendLocked && cancel) return;

      if (inFlightRef.current) {
        if (cancel) cancelInFlight("Canceled by new send");
        else await inFlightRef.current.done;
      }

      const chatId = activeChatId;
      const from = fromLang;
      const to = toLang;

      // Decide title update (first message)
      const existingChat = chats.find((c) => c.id === chatId);
      const shouldSetTitle = existingChat?.title === "New chat";
      const nextTitle = shouldSetTitle ? trimmed.slice(0, 28) : undefined;

      // 1) Insert message row first (use DB id as message id)
      let row: DBMessageRow;
      try {
        row = await dbInsertMessage(chatId, {
          source_language: from,
          target_language: to,
          source_text: trimmed,
          translated_text: "Translating…",
          model: "llama-3.3-70b-versatile",
        });

        // Touch chat updated_at + set title (optional)
        await dbTouchChat(chatId, nextTitle ? { title: nextTitle } : undefined);
      } catch (e: any) {
        pushUploadError(`Failed to save message: ${e?.message ?? "unknown error"}`);
        return;
      }

      const pendingId = row.id;

      // 2) Update UI immediately (optimistic)
      const pendingItem: TranscriptItem = {
        id: pendingId,
        sourceLanguage: from,
        sourceText: trimmed,
        translatedText: "Translating…",
        showPlayForTranslation: false,
        pending: true,
      };

      setMessagesByChat((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] ?? []), pendingItem],
      }));

      setChats((prev) =>
        prev
          .map((c) => {
            if (c.id !== chatId) return c;
            return {
              ...c,
              title: nextTitle ?? c.title,
              updatedAt: Date.now(),
            };
          })
          .sort((a, b) => b.updatedAt - a.updatedAt)
      );

      setTranslationMs(null);
      setCompletion("");

      // 3) Start stream, target the DB message id
      const target: StreamTarget = {
        chatId,
        messageId: pendingId,
        startedAt: performance.now(),
      };
      setStreamTarget(target);
      streamTargetRef.current = target;

      // Promise bridge: resolved/rejected in onFinish/onError
      let resolve!: () => void;
      let reject!: (e: Error) => void;
      const done = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      inFlightRef.current = { messageId: pendingId, done, resolve, reject };

      complete(trimmed, {
        body: {
          text: trimmed,
          fromLang: from,
          toLang: to,
          model: "llama-3.3-70b-versatile",
          // optional: include ids so your /api/translate can also save server-side if you want later
          chatId,
          messageId: pendingId,
        },
      });

      await done;
    },
    [
      activeChatId,
      chats,
      fromLang,
      toLang,
      complete,
      setCompletion,
      cancelInFlight,
      sendLocked,
      dbInsertMessage,
      dbTouchChat,
      pushUploadError,
    ]
  );

  /**
   * Attach files -> extract text -> translate.
   * On failure: update chip + push alert message (accumulates until dismissed).
   */
  const onAttachFiles = useCallback(
    async (files: File[]) => {
      setFileQueueCount((c) => c + files.length);

      const pending: Attachment[] = files.map((f) => ({
        id: makeId(),
        name: f.name,
        status: "uploading",
        mime: f.type,
        size: f.size,
      }));

      setAttachments((prev) => [...prev, ...pending]);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const id = pending[i].id;

        try {
          const { text, filename, mime, chars } = await extractTextViaApi(file);

          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? { ...a, name: filename, status: "ready", mime, chars }
                : a
            )
          );

          const payload = text
            ? `(File: ${filename})\n\n${text}`
            : `[${filename}] (No extractable text found)`;

          await onSendText(payload, { cancelInFlight: false });
          setAttachments((prev) => prev.filter((a) => a.id !== id));
        } catch (e: any) {
          const msg = e instanceof Error ? e.message : String(e);

          setAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status: "error", error: msg } : a))
          );

          pushUploadError(`File processing failed for "${file.name}": ${msg}`);
        } finally {
          setFileQueueCount((c) => Math.max(0, c - 1));
        }
      }
    },
    [onSendText, pushUploadError]
  );

  const onSendFile = useCallback(
    async (file: File) => {
      await onAttachFiles([file]);
    },
    [onAttachFiles]
  );

  const onRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return (
    <div className="h-dvh relative bg-background">
      {/* Error alert (dismissible, shows all recent upload failures) */}
      {uploadErrors.length > 0 && (
        <div className="fixed left-1/2 top-3 z-50 w-[min(720px,calc(100%-1.5rem))] -translate-x-1/2">
          <Alert variant="destructive" className="relative">
            <AlertTitle>An error has occurred</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {uploadErrors.map((m, idx) => (
                  <li key={`${idx}-${m}`} className="break-words">
                    {m}
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setUploadErrors([])}
                >
                  Dismiss
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="flex h-full">
        {/* Desktop sidebar */}
        <aside className="hidden w-80 border-r bg-muted/20 md:block">
          <ChatSidebar
            chats={chats}
            activeChatId={activeChatId}
            onSelect={selectChat}
            onNewChat={newChat}
            onDeleteChat={onDeleteChat}
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
              onDeleteChat={onDeleteChat}
            />
          </SheetContent>

          {/* Main chat */}
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
              onSendFile={onSendFile}
              onAttachFiles={onAttachFiles}
              attachments={attachments.map(({ id, name, status }) => ({
                id,
                name,
                status,
              }))}
              onRemoveAttachment={onRemoveAttachment}
              sendLocked={sendLocked}
            />
          </main>
        </Sheet>
      </div>
    </div>
  );
}
