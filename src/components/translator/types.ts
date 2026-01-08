export type TranscriptItem = {
  id: string;
  sourceLanguage: string;
  sourceText: string;
  translatedText?: string;
  showPlayForTranslation?: boolean;

  pending?: boolean;
  error?: string;
  latencyMs?: number;
};

export type BottomMode = "voice" | "text";

export type Chat = {
  id: string;
  title: string;
  updatedAt: number;
};
