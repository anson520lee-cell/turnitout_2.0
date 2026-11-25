import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Public, statically rendered information pages never emit account-specific HTML
// or refresh cookies. Authenticated routes and Server Action POSTs still go through session handling.
const publicPages = new Set(["/", "/about", "/academic-integrity", "/faq", "/how-it-works", "/pricing",
  "/privacy", "/refunds", "/sample-report", "/services", "/terms"]);

/**
 * Refreshes the Supabase session cookie and redirects signed-out visitors away
 * from app routes. This is a first line only: every protected page and action
 * re-checks the user (and admin role) on the server.
 */
export async function proxy(request: NextRequest) {
  if ((request.method === "GET" || request.method === "HEAD") && publicPages.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|opengraph-image|api/stripe/webhook|api/payments/nowpayments/webhook|api/cron|services/screening(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    // The public form is static, but its submissions still refresh the session.
    { source: "/services/screening", has: [{ type: "header", key: "next-action" }] },
  ],
};
