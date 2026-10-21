"use client";
import { useState } from "react";
import { viewOrderText } from "@/app/actions/admin-activity";
import { SourceText } from "@/components/admin/source-text";
import { Button } from "@/components/ui/button";

/** Loads one order's submitted text on request, so the table itself never carries any text. */
export function ActivityText({ orderId, fileBase }: { orderId: string; fileBase: string }) {
  const [state, setState] = useState<{ status: "idle" | "loading" } | { status: "ok"; text: string } | { status: "error"; message: string }>({ status: "idle" });
  if (state.status === "ok") {
    return (
      <div className="w-[min(640px,80vw)] text-left">
        <SourceText text={state.text} fileBase={fileBase} />
      </div>
    );
  }
  return (
    <div className="text-left">
      <Button
        size="sm"
        variant="secondary"
        disabled={state.status === "loading"}
        onClick={async () => {
          setState({ status: "loading" });
          const r = await viewOrderText(orderId);
          setState(r.ok ? { status: "ok", text: r.text } : { status: "error", message: r.message });
        }}
      >
        {state.status === "loading" ? "Loading…" : "View text"}
      </Button>
      {state.status === "error" && <p className="mt-1 text-[12px] text-risk">{state.message}</p>}
    </div>
  );
}
