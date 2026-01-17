import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the auth session (if needed) and forwards updated cookies.
 * Supabase explicitly recommends using `supabase.auth.getClaims()` in server code
 * (and not trusting `getSession()` for protection). :contentReference[oaicite:4]{index=4}
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Keep request cookies in sync (so downstream server code sees new values)
            request.cookies.set(name, value);
            // And set on the response so the browser receives them
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh + validate JWT signature
  await supabase.auth.getClaims(); // recommended by Supabase for server-side checks :contentReference[oaicite:5]{index=5}

  return response;
}
