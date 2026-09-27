import { z } from "zod";
import { freeScan, refinement } from "@/config/app";
import { countWords } from "@/lib/utils";

export const scanInput = z
  .string()
  .max(freeScan.maxChars, `Text is too long (max ${freeScan.maxChars.toLocaleString()} characters).`)
  .transform((s) => s.trim())
  .refine((s) => s.length > 0, "Paste some text to scan.")
  .refine(
    (s) => countWords(s) >= freeScan.minWords,
    `Add a little more text. The scan needs at least ${freeScan.minWords} words to measure patterns reliably.`,
  )
  .refine(
    (s) => countWords(s) <= freeScan.maxWords,
    `The free scan handles up to ${freeScan.maxWords.toLocaleString()} words at a time.`,
  );

export const screeningType = z.enum(["ai_screening", "similarity_screening", "combined_screening"]);

export const screeningOrderInput = z.object({
  title: z.string().trim().min(1, "Enter a document title.").max(200),
  serviceType: screeningType,
  notes: z.string().trim().max(1000).optional().default(""),
  fileName: z.string().trim().min(1).max(200),
  fileSize: z.number().int().positive(),
  mimeType: z.string(),
  integrity: z.literal(true, { message: "Please confirm you are authorised to submit this document." }),
});

export const refinementOrderInput = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200),
  text: z
    .string()
    .trim()
    .refine((s) => countWords(s) >= refinement.minWords, `Refinement needs at least ${refinement.minWords} words.`)
    .refine((s) => countWords(s) <= refinement.maxWords, `Refinement handles up to ${refinement.maxWords.toLocaleString()} words per order.`),
  instructions: z.string().trim().max(refinement.maxInstructionChars).optional().default(""),
  integrity: z.literal(true, { message: "Please confirm this is your own writing." }),
});

export const uuid = z.string().uuid();

export const screeningResultInput = z.object({
  orderId: uuid,
  aiIndicator: z
    .union([z.literal(""), z.coerce.number().min(0).max(100)])
    .transform((v) => (v === "" ? null : v)),
  aiIndicatorNote: z.string().trim().max(300).optional().default(""),
  similarityPercentage: z
    .union([z.literal(""), z.coerce.number().min(0).max(100)])
    .transform((v) => (v === "" ? null : v)),
  screeningCompletedAt: z.string().trim().min(1, "Enter when the screening was performed."),
  adminNotes: z.string().trim().max(4000).optional().default(""),
});
