"use client";
import { useId, useState, type CSSProperties } from "react";
import { formatCredits, reportPrice, reportPricing } from "@/config/pricing";

const { minChars, maxChars, blockChars } = reportPricing;
const topPrice = reportPrice(maxChars);
// One sample per billable block. Flat sections in the curve are the free part of each cycle.
const samples = Array.from({ length: Math.ceil(maxChars / blockChars) }, (_, i) =>
  reportPrice((i + 1) * blockChars),
);

export function CostPlot() {
  const [chars, setChars] = useState(6000);
  const id = useId();
  const progress = (chars - minChars) / (maxChars - minChars);
  return (
    <div className="cost-plot">
      <label htmlFor={id} className="orbit-kicker">
        <i aria-hidden /> Paid report estimate
      </label>
      <div className="cost-readout">
        <output htmlFor={id}>{formatCredits(reportPrice(chars))}</output>
        <span>{chars.toLocaleString("en-HK")} characters</span>
      </div>
      <div className="cost-chart" style={{ "--position": `${progress * 100}%` } as CSSProperties}>
        <div className="cost-bars" aria-hidden>
          {samples.map((value, i) => (
            <i
              key={i}
              data-lit={i / samples.length <= progress}
              style={{ height: `${(value / topPrice) * 93}%` }}
            />
          ))}
        </div>
        <input
          id={id}
          type="range"
          min={minChars}
          max={maxChars}
          step={1}
          value={chars}
          aria-valuetext={`${chars.toLocaleString("en-HK")} characters, ${formatCredits(reportPrice(chars))}`}
          onChange={(event) => setChars(event.currentTarget.valueAsNumber)}
        />
      </div>
      <div className="plot-axis" aria-hidden>
        <span>{minChars} chars</span>
        <span>{maxChars.toLocaleString("en-HK")}</span>
      </div>
      <p>Drag across the curve to see the price for your document length.</p>
    </div>
  );
}
