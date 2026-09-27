import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { Profile } from "@/types/domain";

export interface SessionUser {
  id: string;
  email: string;
  profile: Profile;
}

/**
 * Returns the verified user (via auth.getUser, which checks the JWT with
 * Supabase) and their profile. The role comes from the database, never from
 * the browser or JWT claims.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Always per-request, never prerendered, even before Supabase is configured.
  await connection();
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,display_name,role,created_at")
    .eq("id", user.id)
    .single<Profile>();
  if (!profile) return null;
  return { id: user.id, email: user.email ?? profile.email, profile };
});

export async function requireUser(next = "/dashboard"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (user.profile.role !== "admin") redirect("/dashboard");
  return user;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function assertAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || user.profile.role !== "admin") throw new Error("Not authorised");
  return user;
}
