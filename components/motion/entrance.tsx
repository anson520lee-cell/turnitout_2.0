"use client";
import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { startEntrance } from "./entrance-engine";

/**
 * Plays the page entrance (see `entrance-engine.ts`) on first load and after
 * every client-side navigation. Lives in the root layout.
 */
export function Entrance() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    // the signed-in app keeps its plain headings; the particle headings are for the public pages
    if (isSignedInArea(pathname)) {
      document.documentElement.classList.remove("ent-pre");
      return;
    }
    return startEntrance();
  }, [pathname]);
  return null;
}

const SIGNED_IN = ["/dashboard", "/billing", "/orders", "/settings", "/scan/history", "/admin"];
const isSignedInArea = (path: string) => SIGNED_IN.some((p) => path === p || path.startsWith(p + "/"));

/**
 * Runs before first paint: hides the page's headings so the entrance
 * doesn't flash the finished heading first. `startEntrance` clears it; the timer
 * is the fail-safe if scripts stall.
 */
export const ENTRANCE_PRE_SCRIPT = `try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches){var d=document.documentElement;d.classList.add("ent-pre");setTimeout(function(){d.classList.remove("ent-pre")},3500)}}catch(e){}`;
