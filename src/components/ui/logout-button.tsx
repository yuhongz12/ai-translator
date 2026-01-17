"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Props = {
  className?: string;
  onError?: (msg: string) => void; // optional hook to show an alert/toast
};

export default function LogoutButton({ className, onError }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;
    setLoading(true);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // Replace prevents back-button returning to protected page
      router.replace("/login");
      router.refresh();
    } catch (e: any) {
      const msg = e?.message ?? "Failed to sign out.";
      onError?.(msg);
      console.error("[logout] error:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className={className}
      onClick={handleLogout}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="mr-2 h-4 w-4" />
      )}
      Log out
    </Button>
  );
}
