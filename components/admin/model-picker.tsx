"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormMessage, Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { resetModelChoice, saveModelChoice } from "@/app/actions/admin-prompt";

type Choice = { id: string; label: string; note: string };
type Effort = "off" | "low" | "high" | "max";

const EFFORTS: { id: Effort; label: string; note: string }[] = [
  { id: "off", label: "Off", note: "No thinking. Fastest, cheapest." },
  { id: "low", label: "Low", note: "A little thinking. Good default." },
  { id: "high", label: "High", note: "More careful, slower." },
  { id: "max", label: "Max", note: "Slowest and costliest. May time out." },
];

/** Model and reasoning choice for the report, on /admin/prompt. */
export function ModelPicker({
  choices,
  model,
  effort,
  custom,
}: {
  choices: readonly Choice[];
  model: string;
  effort: Effort;
  custom: boolean;
}) {
  const router = useRouter();
  const known = choices.some((c) => c.id === model);
  const [picked, setPicked] = useState(known ? model : "other");
  const [other, setOther] = useState(known ? "" : model);
  const [level, setLevel] = useState<Effort>(effort);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const chosenModel = picked === "other" ? other.trim() : picked;
  const changed = chosenModel !== model || level !== effort;

  const run = (action: () => Promise<{ ok: true } | { ok: false; message: string }>, done: string) =>
    start(async () => {
      setMessage(null);
      const res = await action();
      setMessage(res.ok ? { tone: "success", text: done } : { tone: "error", text: res.message });
      if (res.ok) router.refresh();
    });

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="text-[12.5px] font-medium text-fg">Model</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {[...choices, { id: "other", label: "Other model id", note: "Any model id DeepSeek accepts." }].map((c) => (
            <label
              key={c.id}
              className={cn(
                "cursor-pointer rounded-xl border p-3 text-[12.5px] transition",
                picked === c.id ? "border-accent/60 bg-accent/[0.07]" : "border-[var(--line)] bg-white/[0.02] hover:border-[var(--line-strong)]",
              )}
            >
              <input type="radio" name="model" value={c.id} checked={picked === c.id} onChange={() => setPicked(c.id)} className="sr-only" />
              <span className="block font-medium text-fg">{c.label}</span>
              <span className="mt-0.5 block text-fg-subtle">{c.note}</span>
              {c.id !== "other" && <code className="mt-1 block font-mono text-[11px] text-fg-muted">{c.id}</code>}
            </label>
          ))}
        </div>
        {picked === "other" && (
          <Input
            aria-label="Model id"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="e.g. deepseek-v4-pro"
            className="mt-2 max-w-sm font-mono text-[13px]"
          />
        )}
      </fieldset>

      <fieldset>
        <legend className="text-[12.5px] font-medium text-fg">Reasoning</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {EFFORTS.map((e) => (
            <label
              key={e.id}
              className={cn(
                "cursor-pointer rounded-xl border p-3 text-[12.5px] transition",
                level === e.id ? "border-accent/60 bg-accent/[0.07]" : "border-[var(--line)] bg-white/[0.02] hover:border-[var(--line-strong)]",
              )}
            >
              <input type="radio" name="effort" value={e.id} checked={level === e.id} onChange={() => setLevel(e.id)} className="sr-only" />
              <span className="block font-medium text-fg">{e.label}</span>
              <span className="mt-0.5 block text-fg-subtle">{e.note}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-fg-subtle">If thinking leaves no answer, the site retries once with thinking off, so the report still arrives.</p>
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {custom && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => run(resetModelChoice, "Back to the default (Vercel settings).")}>
            Use default
          </Button>
        )}
        <Button
          type="button"
          disabled={pending || !changed || !chosenModel}
          onClick={() => run(() => saveModelChoice({ model: chosenModel, effort: level }), "Saved. New scans use it within about 30 seconds.")}
        >
          {pending ? "Saving…" : "Save model"}
        </Button>
      </div>
      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}
    </div>
  );
}
