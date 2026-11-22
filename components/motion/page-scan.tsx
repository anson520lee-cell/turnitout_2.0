"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Changing page on the public site: one thin scan line runs down the window,
 * like the line that reads the essay on the home page, while the new page's
 * headline rises. It never covers or delays anything: the new page is
 * already there underneath, and the line takes no pointer events. Not on the
 * first load, and not under reduced motion.
 */
export function PageScan() {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.classList.remove("on");
    void el.offsetWidth; // restart the animation
    el.classList.add("on");
  }, [pathname]);

  return <div ref={ref} aria-hidden className="page-scan" onAnimationEnd={(e) => e.currentTarget.classList.remove("on")} />;
}
