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
  useLayoutEffect(() => startEntrance(), [pathname]);
  return null;
}

/**
 * Runs before first paint: hides the page's headings so the entrance
 * doesn't flash the finished heading first. `startEntrance` clears it; the timer
 * is the fail-safe if scripts stall.
 */
export const ENTRANCE_PRE_SCRIPT = `try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches){var d=document.documentElement;d.classList.add("ent-pre");setTimeout(function(){d.classList.remove("ent-pre")},3500)}}catch(e){}`;
