"use client";
import { usePathname } from "next/navigation";

/** A sweep across the sky on arrival. Navigation and focus never wait for it. */
export function Entrance() {
  const path = usePathname();
  return <div key={path} aria-hidden className="orbit-arrival"><i /></div>;
}
