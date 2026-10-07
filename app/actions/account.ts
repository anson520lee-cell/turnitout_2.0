"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function updateDisplayName(name: string): Promise<{ ok: boolean; message: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  const clean = name.trim().slice(0, 80);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ display_name: clean || null }).eq("id", user.id);
  if (error) return { ok: false, message: "Couldn't save your name." };
  revalidatePath("/settings");
  return { ok: true, message: "Saved." };
}

export async function deleteScanHistory(): Promise<{ ok: boolean; message: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  const supabase = await createClient();
  const { error } = await supabase.from("scan_results").delete().eq("user_id", user.id);
  if (error) return { ok: false, message: "Couldn't delete scan history." };
  revalidatePath("/dashboard");
  return { ok: true, message: "Scan history deleted." };
}

/**
 * Creates an already-confirmed account on the server, so sign-up needs no
 * email link or redirect-URL setup (the owner chose to skip email
 * verification). The browser then signs in with the same email and password.
 */
export async function createAccount(input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSupabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, message: "Accounts are being set up. Please try again in a few minutes." };
  }
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, message: "Please enter a valid email address." };
  }
  if (password.length < 8 || password.length > 72) {
    return { ok: false, message: "Use a password of 8 to 72 characters." };
  }
  const { error } = await createAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      return { ok: false, message: "An account with this email already exists. Try logging in." };
    }
    return { ok: false, message: "We couldn't create your account. Please try again." };
  }
  return { ok: true };
}
