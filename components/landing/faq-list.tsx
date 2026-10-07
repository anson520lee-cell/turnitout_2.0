"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import type { FaqItem } from "@/config/faq";
import { cn } from "@/lib/utils";

export function FaqList({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    // The outer box gives the depth its perspective; the tilting wrapper keeps
    // its children in 3D (it carries no blur itself, which would flatten them).
    <div className="[perspective:1300px]">
      <div data-tilt="5" className="faq-3d relative">
        {/* two ghost panes behind, then the pane the questions sit on */}
        <div aria-hidden className="absolute inset-0 rounded-[22px] border border-violet/20 bg-violet/[0.04] [transform:translate3d(16px,14px,-70px)]" />
        <div aria-hidden className="absolute inset-0 rounded-[22px] border border-accent/20 bg-accent/[0.04] [transform:translate3d(8px,7px,-35px)]" />
        <div aria-hidden className="glass-strong absolute inset-0 rounded-[22px]" />
        <div className="faq-3d relative space-y-1 p-2 [transform:translateZ(1px)]">
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={it.q} className="faq-row" data-open={isOpen ? "" : undefined}>
            <h3>
              <button
                type="button"
                data-press
                className="flex w-full items-center justify-between gap-6 rounded-[14px] px-5 py-[18px] text-left text-[15px] font-medium text-fg sm:px-6"
                aria-expanded={isOpen}
                aria-controls={`faq-${i}`}
                id={`faq-q-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
              >
                {it.q}
                <Plus className={cn("size-4 shrink-0 text-fg-muted transition-transform duration-300", isOpen && "rotate-45 text-accent")} aria-hidden />
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={`faq-${i}`}
                  role="region"
                  aria-labelledby={`faq-q-${i}`}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-5 text-[14px] leading-relaxed text-fg-muted sm:px-6">{it.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
        </div>
      </div>
    </div>
  );
}
