import { LockKeyhole, ScanText } from "lucide-react";
import { freeReport } from "@/config/app";
import { formatCredits, reportPrice } from "@/config/pricing";
import { sampleReport } from "@/lib/auto-report/sample";
import type { CSSProperties } from "react";
import styles from "./workflow.module.css";

const paragraphs = sampleReport.paragraphs;
const draft = paragraphs.map((p) => p.sentences.map((s) => s.text).join(" ")).join("\n\n");
const count = draft.length.toLocaleString("en-HK");
const cap = freeReport.maxChars.toLocaleString("en-HK");
const firstSentence = paragraphs[0].sentences[0].text;

export const workflowFrames = [
  <div key="draft" className={styles.proof}>
    <div className={styles.paperTop}>
      <span>Draft excerpt</span>
      <span>P{paragraphs[0].p}</span>
    </div>
    <p>{firstSentence}</p>
    <div className={styles.paperBottom}>
      <i />
      <span>{paragraphs.length} paragraphs</span>
    </div>
  </div>,
  <div key="access" className={styles.access}>
    <div className={styles.fold} aria-hidden>
      <span />
      <span />
      <LockKeyhole size={22} strokeWidth={1.25} />
    </div>
    <div>
      <small>Document access</small>
      <strong>
        You <i>&amp;</i>
        <br />
        authorised staff
      </strong>
    </div>
  </div>,
  <div key="allowance" className={styles.allowance}>
    <small>Daily free allowance</small>
    <p>
      <strong>{count}</strong>
      <span> / {cap} characters</span>
    </p>
    <div
      className={styles.ruler}
      style={{ "--fill": Math.min(1, draft.length / freeReport.maxChars) } as CSSProperties}
    >
      <i />
    </div>
    <div className={styles.scaleEnds}>
      <span>0</span>
      <span>{cap}</span>
    </div>
  </div>,
  <div key="payment" className={styles.receipt}>
    <div className={styles.paperTop}>
      <span>Sample quote</span>
      <span>If paid</span>
    </div>
    <div className={styles.receiptLine}>
      <span>Draft length</span>
      <span>{count} chars</span>
    </div>
    <div className={styles.total}>
      <span>Report total</span>
      <strong>{formatCredits(reportPrice(draft.length))}</strong>
    </div>
  </div>,
  <div key="report" className={styles.miniMap}>
    <small>
      <ScanText size={13} aria-hidden /> Sentences flagged
    </small>
    <div>
      {paragraphs.map((p, k) => {
        const marked = p.sentences.filter((s) => s.risk === "high" || s.risk === "medium").length;
        const fraction = marked / Math.max(p.sentences.length, 1);
        return (
          <div key={p.p} className={styles.mapColumn} data-risk={p.risk} style={{ "--k": k } as CSSProperties}>
            <span>
              {marked}/{p.sentences.length}
            </span>
            <i style={{ "--fill": fraction } as CSSProperties} />
            <b>P{p.p}</b>
          </div>
        );
      })}
    </div>
  </div>,
];
