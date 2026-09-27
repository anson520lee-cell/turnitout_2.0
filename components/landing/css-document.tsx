/**
 * CSS-only document with a scan line: mobile, reduced-motion and no-WebGL
 * fallback, and the final call to action. With the pointer engine running it
 * turns toward the cursor (--cx/--cy) and a highlight slides across it;
 * otherwise it floats at a fixed angle.
 */
export function CssDocument() {
  const widths = [88, 94, 76, 91, 60, 0, 85, 92, 97, 71, 0, 90, 82, 95, 64];
  return (
    <div data-cursor className="absolute inset-0 grid place-items-center [perspective:1200px]">
      <div className="relative h-[72%] w-[56%] [transform-style:preserve-3d] [transform:rotateX(calc(8deg+var(--cy,0)*-10deg))_rotateY(calc(-14deg+var(--cx,0)*16deg))]">
        <div className="doc-bob absolute inset-0 [transform-style:preserve-3d]">
          <div className="absolute inset-0 rounded-2xl border border-violet/20 bg-violet/[0.04] [transform:translate3d(28px,-26px,-60px)]" />
          <div className="absolute inset-0 rounded-2xl border border-accent/25 bg-accent/[0.05] [transform:translate3d(14px,-13px,-30px)]" />
          <div className="glass-strong absolute inset-0 overflow-hidden rounded-2xl p-[9%]">
            <div className="space-y-[5.5%]">
              {widths.map((w, i) =>
                w === 0 ? (
                  <div key={i} className="h-2" />
                ) : (
                  <div
                    key={i}
                    className={`h-[5px] rounded-full ${i === 3 || i === 9 ? "bg-violet/70" : "bg-[#c6d3ff]/25"}`}
                    style={{ width: `${w}%` }}
                  />
                ),
              )}
            </div>
            {/* specular highlight that moves opposite the tilt */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(240px_circle_at_calc(30%+var(--cx,0)*45%)_calc(20%+var(--cy,0)*45%),rgb(200_215_255/0.16),transparent_70%)]" />
            <div
              className="absolute inset-x-0 top-0 h-16 motion-safe:animate-scan bg-gradient-to-b from-transparent via-cyan/15 to-cyan/60 [--scan-distance:420%]"
              style={{ boxShadow: "0 12px 30px -6px rgb(95 216 245 / 0.45)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
