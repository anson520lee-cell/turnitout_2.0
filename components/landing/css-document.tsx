import { GreekText } from "./greek-text";

/**
 * CSS-only document: mobile, reduced-motion and no-WebGL fallback, and the
 * auth-page backdrop. With the pointer engine running it turns toward the
 * cursor (--cx/--cy) and a highlight slides across it; otherwise it floats at
 * a fixed angle. Two ghost sheets sit behind it; on the sheet: a header with a
 * falling loss curve, the text being written and revised, activation bars and
 * a gauge. The run read-outs live in the agent terminal beside it (hero).
 * `wide` fills a narrower slot (the hero, where the terminal takes the left).
 */
export function CssDocument({ wide = false }: { wide?: boolean }) {
  const bars = [38, 62, 44, 78, 52, 90, 34, 66];
  return (
    <div data-cursor className="absolute inset-0 grid place-items-center [perspective:1200px]">
      <div className={`relative h-[72%] ${wide ? "w-[78%]" : "w-[56%]"} [transform-style:preserve-3d] [transform:rotateX(calc(8deg+var(--cy,0)*-10deg))_rotateY(calc(-14deg+var(--cx,0)*16deg))]`}>
        <div className="doc-bob absolute inset-0 [transform-style:preserve-3d]">
          <div className="absolute inset-0 rounded-2xl border border-violet/20 bg-violet/[0.04] [transform:translate3d(28px,-26px,-60px)]" />
          <div className="absolute inset-0 rounded-2xl border border-accent/25 bg-accent/[0.05] [transform:translate3d(14px,-13px,-30px)]" />

          <div className="glass-strong absolute inset-0 overflow-hidden rounded-2xl p-[8%]">
            {/* header: window dots, title bar, score badge */}
            <div className="mb-[7%] flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c6d3ff]/30" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#c6d3ff]/20" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#c6d3ff]/10" />
              <span className="ml-2 h-[5px] w-[22%] rounded-full bg-[#c6d3ff]/35" />
              {/* training loss, falling */}
              <span className="ml-2 flex items-center gap-1 font-mono text-[6px] uppercase tracking-[0.14em] text-fg-subtle">
                loss
                <svg viewBox="0 0 40 12" className="h-2.5 w-8 overflow-visible">
                  <path className="loss-draw" d="M0 2 C6 3 8 6 13 6.5 S22 9 27 9.5 S36 10.4 40 10.6" fill="none" stroke="rgb(95 216 245)" strokeWidth="1.1" pathLength={1} />
                </svg>
              </span>
              <span className="ml-auto rounded-full border border-ok/40 bg-ok/10 px-1.5 py-px font-mono text-[8px] leading-none text-ok">
                0%
              </span>
            </div>

            {/* the text arrives token by token, then a kernel reads features off it */}
            <div className="absolute inset-x-[8%] bottom-[26%] top-[17%]">
              <GreekText caption />
            </div>

            {/* mini chart + gauge */}
            <div className="absolute inset-x-[8%] bottom-[7%] flex items-end gap-[6%]">
              {/* neuron activations: they keep firing at different strengths */}
              <div className="relative flex h-9 flex-1 items-end gap-[5%]">
                <span className="absolute -top-2.5 left-0 font-mono text-[6px] uppercase tracking-[0.16em] text-fg-subtle">activations</span>
                {bars.map((h, i) => (
                  <div
                    key={i}
                    className="act-bar flex-1 rounded-sm bg-gradient-to-t from-accent/10 to-accent/60"
                    style={{ height: `${h}%`, animationDelay: `${-i * 0.31}s`, animationDuration: `${1.2 + (i % 3) * 0.4}s` }}
                  />
                ))}
              </div>
              <div
                className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full"
                style={{ background: "conic-gradient(rgb(79 209 165) 0 92%, rgb(198 211 255 / 0.12) 0)" }}
              >
                <div className="absolute inset-[4px] rounded-full bg-ink-900" />
                <span className="relative font-mono text-[9px] text-ok">PASS</span>
              </div>
            </div>

            {/* specular highlight that moves opposite the tilt */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(240px_circle_at_calc(30%+var(--cx,0)*45%)_calc(20%+var(--cy,0)*45%),rgb(200_215_255/0.16),transparent_70%)]" />
          </div>

        </div>
      </div>
    </div>
  );
}
