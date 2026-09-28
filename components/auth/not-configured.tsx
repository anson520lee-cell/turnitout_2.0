import { WaitingAnimation } from "@/components/ui/waiting";

/**
 * Shown on the sign-in pages until Supabase is connected. The owner asked for
 * the loading animation here rather than an error message; the setup hint for
 * the developer only appears outside production.
 */
export function NotConfigured() {
  return (
    <WaitingAnimation
      title="Getting accounts ready"
      steps={["Connecting accounts", "Preparing sign-in", "Almost there"]}
      stepMs={1800}
      note={
        process.env.NODE_ENV === "production"
          ? "Sign-in opens shortly. The free scan already works without an account."
          : "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable accounts (see README)."
      }
    />
  );
}
