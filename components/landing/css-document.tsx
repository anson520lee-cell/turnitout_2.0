/** CSS-only document with a scan line: mobile, reduced-motion and no-WebGL fallback. */
export function CssDocument() {
  const widths = [88, 94, 76, 91, 60, 0, 85, 92, 97, 71, 0, 90, 82, 95, 64];
  return (
    <div className="absolute inset-0 grid place-items-center [perspective:1200px]">
      <div className="relative h-[72%] w-[56%] motion-safe:animate-float [transform-style:preserve-3d] [transform:rotateX(8deg)_rotateY(-14deg)]">
        <div className="absolute inset-0 translate-x-4 -translate-y-4 rounded-2xl border border-accent/20 bg-accent/[0.04]" />
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
          <div
            className="absolute inset-x-0 top-0 h-16 motion-safe:animate-scan bg-gradient-to-b from-transparent via-cyan/15 to-cyan/60 [--scan-distance:420%]"
            style={{ boxShadow: "0 12px 30px -6px rgb(95 216 245 / 0.45)" }}
          />
        </div>
      </div>
    </div>
  );
}
