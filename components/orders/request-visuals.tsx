"use client";
import { LiveStage } from "@/components/visuals/live-ticker";

/**
 * Illustrations for the report request page. They are
 * decorative: made-up numbers that never stop moving, so nothing here can be
 * mistaken for a real screening outcome.
 */

export function ReportVisual({ className }: { className?: string }) {
  return <LiveStage className={className} chips />;
}

