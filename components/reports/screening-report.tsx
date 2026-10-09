"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Download, ExternalLink, FileText, Info, ShieldCheck } from "lucide-react";
import type { Order, OrderFile, ScreeningResultRow } from "@/types/domain";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { disclaimers, serviceLabels } from "@/config/services";
import { formatDateTime } from "@/lib/utils";
import { track } from "@/lib/analytics";

function Metric({
  title,
  value,
  note,
  requested,
  delay,
}: {
  title: string;
  value: number | null;
  note?: string | null;
  requested: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className="glass-strong relative flex flex-col items-center overflow-hidden rounded-2xl p-6 text-center"
    >
      <div aria-hidden className="absolute -top-16 size-40 rounded-full bg-accent/15 blur-3xl" />
      <p className="relative text-[13px] text-fg-muted">{title}</p>
      {!requested ? (
        <p className="relative mt-8 mb-8 text-[13px] text-fg-subtle">Not part of this order</p>
      ) : value === null ? (
        <div className="relative my-6">
          <p className="text-xl font-semibold text-fg-muted">Not returned</p>
          <p className="mx-auto mt-2 max-w-[220px] text-[12.5px] text-fg-subtle">
            {note || "The screening did not return this value. We don't estimate missing values."}
          </p>
        </div>
      ) : (
        <ProgressRing value={value} className="relative mt-4" label={`${title}: ${value}%`}>
          <span className="text-3xl font-semibold tracking-tight">
            {Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            <span className="text-lg text-fg-muted">%</span>
          </span>
        </ProgressRing>
      )}
      <p className="relative mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-fg-subtle">From Turnitin screening</p>
    </motion.div>
  );
}

export function ScreeningReport({
  order,
  file,
  result,
}: {
  order: Order;
  file: OrderFile | null;
  result: ScreeningResultRow;
}) {
  const wantsAi = order.service_type !== "similarity_screening";
  const wantsSim = order.service_type !== "ai_screening";
  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong noise relative overflow-hidden rounded-3xl p-6 sm:p-8"
      >
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_80%_at_90%_0%,rgb(79_209_165/0.12),transparent_70%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-ok">
              <ShieldCheck className="size-4" /> Screening complete
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">{order.title}</h2>
            <p className="mt-1 text-[13px] text-fg-muted">Result generated from a Turnitin screening workflow.</p>
          </div>
          <Badge tone="success" dot>{serviceLabels[order.service_type]}</Badge>
        </div>
        <dl className="relative mt-6 grid gap-4 border-t border-[var(--line)] pt-5 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="text-fg-subtle">Document</dt>
            <dd className="mt-1 flex items-center gap-1.5 truncate">
              <FileText className="size-3.5 shrink-0 text-fg-subtle" />
              {file?.file_name ?? (order.word_count ? `Pasted text · ${order.word_count.toLocaleString("en-HK")} words` : "Pasted text")}
            </dd>
          </div>
          <div>
            <dt className="text-fg-subtle">Screening provider</dt>
            <dd className="mt-1">Turnitin (third-party)</dd>
          </div>
          <div>
            <dt className="text-fg-subtle">Screened</dt>
            <dd className="mt-1">{formatDateTime(result.screening_completed_at)}</dd>
          </div>
        </dl>
      </motion.div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Metric title="AI-writing indicator" value={result.ai_indicator === null ? null : Number(result.ai_indicator)} note={result.ai_indicator_note} requested={wantsAi} delay={0.1} />
        <Metric title="Similarity" value={result.similarity_percentage === null ? null : Number(result.similarity_percentage)} requested={wantsSim} delay={0.2} />
      </div>

      <div className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
        <div>
          <p className="text-[14px] font-medium">Screening report</p>
          <p className="text-[12.5px] text-fg-subtle">{result.report_storage_path ? result.report_file_name ?? "Report file" : "No report file was attached to this result."}</p>
        </div>
        {result.report_storage_path && (
          <div className="flex gap-2">
            <a href={`/api/files/report/${order.id}`} target="_blank" rel="noopener" onClick={() => track("report_opened")} className={buttonClasses("secondary", "md")}>
              <ExternalLink className="size-4" /> View report
            </a>
            <a href={`/api/files/report/${order.id}?download=1`} onClick={() => track("report_downloaded")} className={buttonClasses("primary", "md")}>
              <Download className="size-4" /> Download
            </a>
          </div>
        )}
      </div>

      <p className="flex gap-2 rounded-2xl border border-[var(--line)] bg-ink-900/40 p-4 text-[12.5px] leading-relaxed text-fg-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>
          {disclaimers.screeningResult} {disclaimers.turnitin}
        </span>
      </p>

      <div className="flex flex-wrap gap-2">
        <Link href="/services/screening" className={buttonClasses("secondary", "md")}>Get another report</Link>
        <Link href="/services/refinement" className={buttonClasses("ghost", "md")}>Writing refinement</Link>
      </div>
    </div>
  );
}
