"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

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
