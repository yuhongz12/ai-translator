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

export default function TranslatorShell() {
  const [fromLang, setFromLang] = useState("English");
  const [toLang, setToLang] = useState("Chinese");
  const [mode, setMode] = useState<BottomMode>("text");
  const [translationMs, setTranslationMs] = useState<number | null>(null);

  // File failure alert state (accumulates messages until dismissed)
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const pushUploadError = useCallback((msg: string) => {
    setUploadErrors((prev) => [...prev, msg]);
  }, []);

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

  const newChat = useCallback(() => {
    cancelInFlight("New chat");

    const id = makeId();
    setChats((prev) => [
      { id, title: "New chat", updatedAt: Date.now() },
      ...prev,
    ]);
    setMessagesByChat((prev) => ({ ...prev, [id]: [] }));
    setActiveChatId(id);
    setTranslationMs(null);
    setSidebarOpen(false);
  }, [cancelInFlight]);

  const selectChat = useCallback(
    (id: string) => {
      cancelInFlight("Switched chat");
      setActiveChatId(id);
      setTranslationMs(null);
      setSidebarOpen(false);
    },
    [cancelInFlight]
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

      // If user is trying to send a typed message while file processing is active,
      // block it. (File-triggered sends call onSendText(..., { cancelInFlight:false })
      // so they bypass this guard.)
      if (sendLocked && cancel) {
        // Optional: show a UI message / toast instead of silently returning
        // pushUploadError("Files are processing—please wait before sending a message.");
        return;
      }


      if (inFlightRef.current) {
        if (cancel) cancelInFlight("Canceled by new send");
        else await inFlightRef.current.done; // queue behind existing stream
      }

      // Snapshot current state at send-time
      const chatId = activeChatId;
      const from = fromLang;
      const to = toLang;

      const pendingId = makeId();
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
            const title =
              c.title === "New chat" ? trimmed.slice(0, 28) : c.title;
            return { ...c, title, updatedAt: Date.now() };
          })
          .sort((a, b) => b.updatedAt - a.updatedAt)
      );

      setTranslationMs(null);
      setCompletion("");

      const target: StreamTarget = {
        chatId,
        messageId: pendingId,
        startedAt: performance.now(),
      };
      setStreamTarget(target);
      streamTargetRef.current = target;

      // Promise bridge: resolve/reject happens in onFinish/onError
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
        },
      });

      await done;
    },
    [activeChatId, fromLang, toLang, complete, setCompletion, cancelInFlight, sendLocked]
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
          // 1) Extract
          const { text, filename, mime, chars } = await extractTextViaApi(file);

          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id ? { ...a, name: filename, status: "ready", mime, chars } : a
            )
          );

          // 2) Translate (queued behind any current stream)
          const payload = text
            ? `(File: ${filename})\n\n${text}`
            : `[${filename}] (No extractable text found)`;

          try {
            await onSendText(payload, { cancelInFlight: false });

            // Remove chip after translation completes successfully
            setAttachments((prev) => prev.filter((a) => a.id !== id));
          } catch (e: any) {
            const msg = e instanceof Error ? e.message : String(e);

            setAttachments((prev) =>
              prev.map((a) =>
                a.id === id ? { ...a, status: "error", error: msg } : a
              )
            );

            pushUploadError(`Translation failed for "${filename}": ${msg}`);
          }
        } catch (e: any) {
          const msg = e instanceof Error ? e.message : String(e);

          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id ? { ...a, status: "error", error: msg } : a
            )
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
    <div className="h-dvh bg-background">
      {/* Error alert (dismissible, shows all recent upload failures) */}
      {uploadErrors.length > 0 && (
        <div className="border-b bg-background p-3">
          <Alert variant="destructive" className="relative">
            <AlertTitle>File upload failed</AlertTitle>
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
