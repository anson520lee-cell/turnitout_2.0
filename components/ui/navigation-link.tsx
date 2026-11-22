"use client";

import Link, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import type { ComponentProps } from "react";

function NavigationStatus() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return createPortal(
    <div role="status" data-navigation-pending className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 bg-accent">
      <span className="sr-only">Loading page…</span>
    </div>,
    document.body,
  );
}

export function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}>{children}<NavigationStatus /></Link>;
}
