"use client";

import Link, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import type { ComponentProps } from "react";

/**
 * While a navigation started by this link waits for the server:
 * - a thin line runs along the top of the window (a status for screen readers);
 * - a hidden marker inside the link lets CSS show the pressed tab, rail item or
 *   row as the place you're going (`a:has(> [data-link-pending])`), so it
 *   answers on the spot instead of when the next page arrives.
 */
function NavigationStatus() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <>
      <span data-link-pending hidden />
      {createPortal(
        <div role="status" data-navigation-pending className="nav-pending">
          <span className="sr-only">Loading page…</span>
        </div>,
        document.body,
      )}
    </>
  );
}

export function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}>{children}<NavigationStatus /></Link>;
}
