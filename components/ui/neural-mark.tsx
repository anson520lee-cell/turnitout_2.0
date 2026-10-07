import { cn } from "@/lib/utils";

/** A tiny neural network (one neuron feeding two, feeding one) whose nodes fire in order. Decorative. */
export function NeuralMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 16" aria-hidden className={cn("neural-mark inline-block h-3 w-[21px] shrink-0", className)}>
      <path d="M3 8 L14 3 L25 8 M3 8 L14 13 L25 8" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1" />
      <circle cx="3" cy="8" r="2.2" fill="#5fd8f5" />
      <circle cx="14" cy="3" r="2.2" fill="currentColor" />
      <circle cx="14" cy="13" r="2.2" fill="currentColor" />
      <circle cx="25" cy="8" r="2.2" fill="#9a7bff" />
    </svg>
  );
}
