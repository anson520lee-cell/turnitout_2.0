"use client";
import { LensReveal } from "@/components/motion/lens-reveal";
import { brand } from "@/config/app";

/**
 * The footer's giant wordmark, drawn as a 1px outline. A reading lens fills
 * it in wherever the pointer passes (on touch, where the finger lands), and
 * reads across it once by itself the first time it comes into view.
 * Decorative: the name is in the logo above.
 */
export function FooterWordmark() {
  return (
    <div aria-hidden className="footer-wordmark-wrap">
      <LensReveal
        size={96}
        sweep
        className="footer-wordmark-lens"
        reveal={<span className="footer-mark footer-mark-solid">{brand.name}</span>}
      >
        <span className="footer-mark footer-mark-outline">{brand.name}</span>
      </LensReveal>
    </div>
  );
}
