'use client';

import { useCompletion } from '@ai-sdk/react';
import { ArrowRight, RefreshCcw, Sparkles, Zap } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

export default function FastTranslator() {
  const [targetLang, setTargetLang] = useState('Spanish');
  const startTimeRef = useRef<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  // useCompletion handles the streaming automatically
  const { complete, completion, isLoading } = useCompletion({
    api: '/api/translate',
    body: { language: targetLang }, // Send the selected language to backend
  });

  useEffect(() => {
    // If we have text, and we haven't calculated latency yet...
    if (completion.length > 0 && latency === null && startTimeRef.current) {
      const ttfb = Date.now() - startTimeRef.current;
      setLatency(ttfb);
    }
  }, [completion, latency]);

  const handleTranslate = async () => {
    const text = document.getElementById('input-text') as HTMLTextAreaElement;
    if (!text.value) return;

    // Reset everything
    setLatency(null);
    startTimeRef.current = Date.now();

    // Trigger the translation
    await complete(text.value);
  };

  return (
    <div className="min-h-screen bg-[#f0f4f9] text-gray-800 font-sans selection:bg-blue-100 p-6 flex flex-col items-center">

      {/* Header */}
      <div className="w-full max-w-3xl flex justify-between items-center mb-10 mt-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-semibold bg-gradient-to-r from-blue-600 to-red-500 bg-clip-text text-transparent">
            Gemini Translate
          </span>
          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">Experiment</span>
        </div>
      </div>

      <div className="w-full max-w-3xl space-y-6">

        {/* INPUT CARD */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-transparent focus-within:border-blue-200 focus-within:shadow-md transition-all duration-300">
          <textarea
            id="input-text"
            className="w-full bg-transparent text-lg text-gray-700 placeholder-gray-400 outline-none resize-none h-32 leading-relaxed"
            placeholder="Enter text to translate..."
          />

          <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
            {/* Language Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Translate to:</span>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-1.5 px-3 rounded-lg border-none outline-none cursor-pointer transition-colors"
              >
                <option value="Spanish">Spanish 🇪🇸</option>
                <option value="French">French 🇫🇷</option>
                <option value="Japanese">Japanese 🇯🇵</option>
                <option value="German">German 🇩🇪</option>
                <option value="Mandarin">Mandarin 🇨🇳</option>
              </select>
            </div>

            {/* Action Button */}
            <button
              onClick={handleTranslate}
              disabled={isLoading}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm transition-all duration-200 ${isLoading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-black text-white hover:bg-gray-800 hover:scale-105 active:scale-95 shadow-lg'
                }`}
            >
              {isLoading ? (
                <>
                  <RefreshCcw className="w-4 h-4 animate-spin" />
                  Translating...
                </>
              ) : (
                <>
                  Translate <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* OUTPUT CARD (Only shows when active) */}
        {(completion || isLoading) && (
          <div className="relative group">
            {/* The "Gemini Sparkle" Icon */}
            <div className="absolute -left-10 top-6 hidden md:block">
              <Sparkles className={`w-6 h-6 ${isLoading ? 'text-blue-500 animate-pulse' : 'text-blue-600'}`} />
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-sm border border-white">
              {/* Streaming Text */}
              <div className="text-lg leading-relaxed text-gray-800">
                {completion}
                {/* Blinking Cursor effect while loading */}
                {isLoading && (
                  <span className="inline-block w-2 h-5 ml-1 align-middle bg-blue-500 animate-pulse rounded-full" />
                )}
              </div>

              {/* Stats Footer */}
              <div className="mt-6 flex items-center justify-end gap-4 text-xs text-gray-400 font-medium">
                {latency && (
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${latency < 300 ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
                    }`}>
                    <Zap className="w-3 h-3 fill-current" />
                    <span>{latency}ms TTFB</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span>Groq LPU Inference</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Footer Branding */}
      <div className="fixed bottom-4 text-center w-full text-xs text-gray-400">
        Powered by Next.js & Llama 3
      </div>
    </div>
  );
}