"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import router from "next/router";
import ProlingualLogo from "@/components/translator/logo";

export default function LoginPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      }

      // If you have a protected app route, middleware + server checks will handle redirect there.
      window.location.href = "/";

    } catch (err: any) {
      setError(err?.message ?? "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md items-center px-6">

      <div className="w-full">

        {/* LOGO PLACEMENT */}
        <div className="mb-8 flex justify-center">
          <ProlingualLogo variant="default" className="text-5xl" />
        </div>

        <form onSubmit={onSubmit} className="w-full space-y-3">
          <h1 className="text-xl font-semibold">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>

          <input
            className="w-full rounded-md border px-3 py-2"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            className="w-full rounded-md border px-3 py-2"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">{error}</div>}

          <button
            className="w-full rounded-md bg-black px-3 py-2 text-white disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "…" : mode === "signin" ? "Sign in" : "Sign up"}
          </button>

          <button
            type="button"
            className="w-full text-sm underline"
            onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
          >
            {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
