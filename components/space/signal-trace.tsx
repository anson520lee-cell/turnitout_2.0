import type { CSSProperties } from "react";

/** A cross-section of the orbital bands, used in the compact workspace and form headers. */
export function SignalTrace() {
  return (
    <span aria-hidden className="signal-trace" data-cursor>
      {Array.from({ length: 32 }, (_, i) => {
        const envelope = Math.sin(((i + 0.5) / 32) * Math.PI);
        const height = 0.15 + 0.85 * envelope * (0.55 + 0.45 * Math.sin(i * 0.41 + 0.8));
        return <i key={i} style={{ "--bar-height": height, "--phase": `${-i * 0.08}s` } as CSSProperties} />;
      })}
    </span>
  );
}
