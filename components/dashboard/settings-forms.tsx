"use client";
import { useState, useTransition } from "react";
import { updateDisplayName, deleteScanHistory } from "@/app/actions/account";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";

/** `preview`: the design preview's made-up account, where the buttons answer but nothing is saved. */
const previewNote = { ok: false, message: "This preview uses a made-up account, so nothing is saved." };

export function SettingsForms({ displayName, email, preview }: { displayName: string; email: string; preview?: boolean }) {
  const [name, setName] = useState(displayName);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="space-y-5 p-5 sm:p-6">
      <h2 className="app-k">
        <span className="nav-idx">01</span> Profile
      </h2>
      <Field label="Email" htmlFor="email"><Input id="email" value={email} disabled /></Field>
      <Field label="Display name" htmlFor="name">
        <Input id="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </Field>
      {msg && <FormMessage tone={msg.ok ? "success" : "error"}>{msg.message}</FormMessage>}
      <div className="flex flex-wrap gap-2">
        <Button loading={pending} onClick={() => (preview ? setMsg(previewNote) : start(async () => setMsg(await updateDisplayName(name))))}>Save</Button>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() => {
            if (preview) return setMsg(previewNote);
            if (!confirm("Delete all your saved scan results? This can't be undone.")) return;
            start(async () => setMsg(await deleteScanHistory()));
          }}
        >
          Delete scan history
        </Button>
      </div>
    </Card>
  );
}
