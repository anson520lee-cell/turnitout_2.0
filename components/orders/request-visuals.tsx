"use client";
import { LiveStage } from "@/components/visuals/live-ticker";

/**
 * Illustrations for the report and refinement request pages. They are
 * decorative: made-up numbers that never stop moving, so nothing here can be
 * mistaken for a real screening outcome.
 */

export function ReportVisual({ className }: { className?: string }) {
  return <LiveStage className={className} chips />;
}

/** The same ticker, with a draft's line drawn against its rewrite's (both made up and independent). */
export function RefinementVisual({ className }: { className?: string }) {
  return <LiveStage className={className} title="Writing Refinement" tiles={["Sentences", "Rewritten"]} compare={["Draft", "Refined"]} center />;
}
