import { FormMessage } from "@/components/ui/field";

export function NotConfigured() {
  return (
    <FormMessage tone="info">
      Accounts aren&rsquo;t available yet: Supabase isn&rsquo;t configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see README).
    </FormMessage>
  );
}
