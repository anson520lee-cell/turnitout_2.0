import { z } from "zod";
import { freeScan, refinement } from "@/config/app";
import { billableChars } from "@/config/pricing";
import { claimReference, MANUAL_PAYMENT_METHODS } from "@/config/payments";
import { freeScanCharError, refinementCharError, screeningWordError } from "@/lib/orders/limits";
import { countWords } from "@/lib/utils";

export const scanInput = z
  .string()
  .max(freeScan.maxChars, `Text is too long (max ${freeScan.maxChars.toLocaleString()} characters).`)
  .transform((s) => s.trim())
  .superRefine((s, ctx) => {
    const problem = s ? freeScanCharError(s.length) : "Paste some text to scan.";
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

export const screeningType = z.enum(["ai_screening", "similarity_screening", "combined_screening"]);

/** Hard ceiling on pasted text, well above 29,000 words, to stop abuse. */
const MAX_PASTE_CHARS = 400_000;

/** Legacy file-upload screening orders. New orders are text only (below). */
export const screeningOrderInput = z.object({
  title: z.string().trim().min(1, "Enter a document title.").max(200),
  serviceType: z.literal("combined_screening"),
  notes: z.string().trim().max(1000).optional().default(""),
  fileName: z.string().trim().min(1).max(200),
  fileSize: z.number().int().positive(),
  mimeType: z.string(),
  integrity: z.literal(true, { message: "Please confirm you are authorised to submit this document." }),
});

/** Report request: the pasted text only. Price and title are set by the server. */
export const screeningTextOrderInput = z.object({
  text: z
    .string()
    .max(MAX_PASTE_CHARS, "That text is too long for one report.")
    .transform((s) => s.trim())
    .superRefine((s, ctx) => {
      const problem = s ? screeningWordError(countWords(s)) : "Paste the text you want a report for.";
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
});

export const refinementOrderInput = z.object({
  text: z
    .string()
    .max(refinement.maxChars * 2, "That text is too long for one order.")
    .transform((s) => s.trim())
    .superRefine((s, ctx) => {
      const problem = s ? refinementCharError(billableChars(s)) : "Paste the text you want refined.";
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    }),
  instructions: z.string().trim().max(refinement.maxInstructionChars).optional().default(""),
});

export const paymentClaimInput = z.object({
  orderId: z.string().uuid(),
  method: z.enum(MANUAL_PAYMENT_METHODS, { message: "Choose how you paid." }),
  reference: z
    .string()
    .trim()
    .min(claimReference.min, "Enter your payment reference so we can find your payment.")
    .max(claimReference.max, `Keep the reference under ${claimReference.max} characters.`),
});

export const claimReviewInput = z.object({
  claimId: z.string().uuid(),
  note: z.string().trim().max(500, "Keep the note under 500 characters.").optional().default(""),
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
