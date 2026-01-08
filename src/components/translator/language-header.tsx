"use client";

import { ArrowLeftRight, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import type { BottomMode } from "./types";
import LanguagePicker from "./language-picker";
import { LANGUAGES } from "./languages";

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
};

export default function LanguageHeader({
  fromLang,
  toLang,
  translationMs,
  onChangeFrom,
  onChangeTo,
  onSwap,
  onOpenSidebar,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      {/* Mobile menu */}
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="h-10 w-10 rounded-full md:hidden"
        onClick={onOpenSidebar}
        aria-label="Open chat history"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Language pill */}
      <div className="flex flex-1 items-center rounded-full bg-muted/60 p-1">
        <div className="flex w-full items-center gap-1">
          <div className="flex-1">
            <LanguagePicker
              value={fromLang}
              options={LANGUAGES}
              onChange={onChangeFrom}
              ariaLabel="From language"
            />
          </div>
          <div className="flex-1">
            <LanguagePicker
              value={toLang}
              options={LANGUAGES}
              onChange={onChangeTo}
              ariaLabel="To language"
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={onSwap}
            aria-label="Swap languages"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {translationMs != null ? (
        <Badge variant="secondary" className="hidden sm:inline-flex">
          {Math.round(translationMs)} ms
        </Badge>
      ) : null}
    </div>
  );
}
