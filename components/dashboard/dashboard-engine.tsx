"use client";
import { useRef } from "react";
import { NeuralEngine } from "@/components/landing/neural-engine";
import { cn } from "@/lib/utils";

/** The home page's live Pattern Engine, sized for the dashboard banner. No signal list sits beside it here. */
export function DashboardEngine({ className }: { className?: string }) {
  const focus = useRef<number | null>(null);
  const rows = useRef<(HTMLElement | null)[]>([]);
  return (
    <div className={cn("w-full", className)}>
      <NeuralEngine focus={focus} listItems={rows} />
    </div>
  );
}
