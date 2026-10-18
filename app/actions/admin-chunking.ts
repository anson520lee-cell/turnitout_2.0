"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { mixTexts, truthFor } from "@/lib/chunk-samples";
import { uuid } from "@/lib/validation/schemas";
import type { TruthSentence } from "@/lib/eval";

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const MAX_BODY = 30_000;

const sampleInput = z.object({
  name: z.string().trim().min(1, "Give the sample a name.").max(120),
  origin: z.enum(["human", "ai", "turnitin"]),
  body: z.string().trim().min(500, "The text is too short to be useful (at least 500 characters).").max(MAX_BODY, `The text is limited to ${MAX_BODY.toLocaleString("en-HK")} characters.`),
  flagged: z.string().max(30_000).optional().default(""),
  note: z.string().trim().max(500).optional(),
});

/** Adds one sample text. "Turnitin-marked" needs the sentences Turnitin flagged, one per line. */
export async function addChunkSample(input: unknown): Promise<Result<{ sentences: number; flagged: number; unmatched: string[] }>> {
  const admin = await assertAdmin();
  const parsed = sampleInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid sample." };
  const v = parsed.data;
  const { truth, unmatched } = truthFor(v.origin, v.body, v.flagged);
  const flagged = truth.filter((t) => t.flagged).length;
  if (v.origin === "turnitin" && flagged === 0) return { ok: false, message: "None of the pasted lines matched a sentence in the text. Paste the flagged sentences exactly as they appear." };
  const { error } = await createAdminClient().from("chunk_samples").insert({ name: v.name, origin: v.origin, body: v.body, sentences: truth, note: v.note || null });
  if (error) return { ok: false, message: "Couldn't save the sample." };
  await audit("chunk_sample_added", { actorId: admin.id, detail: { origin: v.origin, sentences: truth.length } });
  revalidatePath("/admin/chunking");
  return { ok: true, sentences: truth.length, flagged, unmatched };
}

const bulkInput = z.object({
  origin: z.enum(["human", "ai"]),
  namePrefix: z.string().trim().min(1).max(60),
  /** Texts separated by a line of five or more "=" characters. */
  text: z.string().max(400_000),
});

/** Adds many human-only or AI-only texts at once (separated by a line of =====). */
export async function addChunkSamplesBulk(input: unknown): Promise<Result<{ added: number; skipped: number }>> {
  const admin = await assertAdmin();
  const parsed = bulkInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input." };
  const parts = parsed.data.text.split(/^\s*={5,}\s*$/m).map((p) => p.trim()).filter(Boolean);
  const rows = parts
    .filter((p) => p.length >= 500 && p.length <= MAX_BODY)
    .map((body, i) => ({ name: `${parsed.data.namePrefix} ${i + 1}`, origin: parsed.data.origin, body, sentences: truthFor(parsed.data.origin, body, "").truth }));
  if (rows.length === 0) return { ok: false, message: "No text of 500 to 30,000 characters found. Separate texts with a line of =====." };
  const { error } = await createAdminClient().from("chunk_samples").insert(rows);
  if (error) return { ok: false, message: "Couldn't save the samples." };
  await audit("chunk_sample_added", { actorId: admin.id, detail: { origin: parsed.data.origin, count: rows.length } });
  revalidatePath("/admin/chunking");
  return { ok: true, added: rows.length, skipped: parts.length - rows.length };
}

/** Loads the built-in starter set (Brown corpus texts as human, model-written essays as AI) unless already loaded. */
export async function loadStarterSamples(): Promise<Result<{ added: number }>> {
  const admin = await assertAdmin();
  const { STARTER_SAMPLES } = await import("@/lib/starter-samples");
  const db = createAdminClient();
  const { data: have } = await db.from("chunk_samples").select("name");
  const names = new Set((have ?? []).map((r: { name: string }) => r.name));
  const rows = STARTER_SAMPLES.filter((s) => !names.has(s.name)).map((s) => ({
    name: s.name,
    origin: s.origin,
    body: s.body,
    sentences: truthFor(s.origin, s.body, "").truth,
    note: s.note,
  }));
  if (rows.length === 0) return { ok: true, added: 0 };
  const { error } = await db.from("chunk_samples").insert(rows);
  if (error) return { ok: false, message: "Couldn't save the starter set." };
  await audit("chunk_sample_added", { actorId: admin.id, detail: { starter: rows.length } });
  revalidatePath("/admin/chunking");
  return { ok: true, added: rows.length };
}

/** Copies the Turnitin test cases from the Accuracy page into the experiment (once each). */
export async function importEvalCases(): Promise<Result<{ added: number }>> {
  await assertAdmin();
  const db = createAdminClient();
  const [{ data: cases }, { data: have }] = await Promise.all([
    db.from("eval_cases").select("name,body,sentences,note"),
    db.from("chunk_samples").select("name"),
  ]);
  const names = new Set((have ?? []).map((r: { name: string }) => r.name));
  const rows = ((cases ?? []) as { name: string; body: string; sentences: TruthSentence[]; note: string | null }[])
    .filter((c) => !names.has(c.name))
    .map((c) => ({ name: c.name, origin: "turnitin", body: c.body, sentences: c.sentences, note: c.note }));
  if (rows.length === 0) return { ok: true, added: 0 };
  const { error } = await db.from("chunk_samples").insert(rows);
  if (error) return { ok: false, message: "Couldn't copy the cases." };
  revalidatePath("/admin/chunking");
  return { ok: true, added: rows.length };
}

const mixInput = z.object({ humanId: uuid, aiId: uuid, name: z.string().trim().min(1).max(120) });

/** Joins a human sample and an AI sample, two paragraphs at a time, into one sample whose labels are known. */
export async function createMixedSample(input: unknown): Promise<Result> {
  const admin = await assertAdmin();
  const parsed = mixInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose one human sample and one AI sample." };
  const db = createAdminClient();
  const { data } = await db.from("chunk_samples").select("id,origin,body").in("id", [parsed.data.humanId, parsed.data.aiId]);
  const rows = (data ?? []) as { id: string; origin: string; body: string }[];
  const human = rows.find((r) => r.id === parsed.data.humanId);
  const ai = rows.find((r) => r.id === parsed.data.aiId);
  if (!human || !ai || human.origin !== "human" || ai.origin !== "ai") return { ok: false, message: "Choose one human sample and one AI sample." };
  const mixed = mixTexts(human.body, ai.body);
  if (!mixed) return { ok: false, message: "Couldn't join those two texts." };
  const { error } = await db.from("chunk_samples").insert({ name: parsed.data.name, origin: "mixed", body: mixed.body, sentences: mixed.truth, note: "Human and AI paragraphs, two at a time" });
  if (error) return { ok: false, message: "Couldn't save the mixed sample." };
  await audit("chunk_sample_added", { actorId: admin.id, detail: { origin: "mixed" } });
  revalidatePath("/admin/chunking");
  return { ok: true };
}

export async function deleteChunkSample(id: unknown): Promise<Result> {
  const admin = await assertAdmin();
  if (!uuid.safeParse(id).success) return { ok: false, message: "Unknown sample." };
  const { error } = await createAdminClient().from("chunk_samples").delete().eq("id", id as string);
  if (error) return { ok: false, message: "Couldn't delete the sample." };
  await audit("chunk_sample_deleted", { actorId: admin.id });
  revalidatePath("/admin/chunking");
  return { ok: true };
}
