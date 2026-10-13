import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { isProtectedPath } from "@/lib/auth/routes";
import { buildCsp, createNonce } from "@/lib/security/csp";
import { getPublicEnv } from "@/lib/env";

export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const env = getPublicEnv();
  const csp = buildCsp(nonce, {
    isDev: process.env.NODE_ENV === "development",
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    httpsSite: env.NEXT_PUBLIC_SITE_URL.startsWith("https://"),
  });

  const { response, userId } = await updateSession(request, {
    "x-nonce": nonce,
    "Content-Security-Policy": csp,
  });
  const { pathname, search } = request.nextUrl;

  if (!userId && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname + search);
    const redirect = NextResponse.redirect(url);
    // Carry over any refreshed/cleared auth cookies.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except static assets and image optimisation.
      source:
        "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
