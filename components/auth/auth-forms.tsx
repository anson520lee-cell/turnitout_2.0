"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { GoogleButton, Divider } from "./google-button";
import { safeNext } from "@/lib/utils";
import { track } from "@/lib/analytics";

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "That email and password don't match an account.";
  if (m.includes("email not confirmed")) return "Please confirm your email first. Check your inbox for the link.";
  if (m.includes("already registered")) return "An account with this email already exists. Try logging in.";
  if (m.includes("password") && m.includes("characters")) return "Use a password of at least 8 characters.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("fetch")) return "Can't reach the server. Check your connection and try again.";
  return message;
}

function Heading({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-[14px] text-fg-muted">{body}</p>
    </div>
  );
}

export function LoginForm({ google }: { google: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "link" ? "That link is invalid or has expired. Please try again." : null,
  );
  const [loading, setLoading] = useState(false);

  return (
    <>
      <Heading title="Welcome back" body={<>New here? <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-accent hover:underline">Create an account</Link></>} />
      {google && (
        <>
          <GoogleButton next={next} />
          <Divider />
        </>
      )}
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setLoading(true);
          const { error } = await createClient().auth.signInWithPassword({ email, password });
          setLoading(false);
          if (error) return setError(friendly(error.message));
          track("login_completed");
          router.replace(next);
          router.refresh();
        }}
      >
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={<span className="flex justify-between">Password <Link href="/forgot-password" className="font-normal text-fg-muted hover:text-fg">Forgot?</Link></span>} htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <FormMessage>{error}</FormMessage>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Log in
        </Button>
      </form>
    </>
  );
}

export function SignupForm({ google }: { google: boolean }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"), "/scan");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (done) {
    return (
      <>
        <Heading title="Check your email" body={<>We sent a confirmation link to <span className="text-fg">{email}</span>. Open it to activate your account.</>} />
        <FormMessage tone="info">The link opens this site and signs you in. It can take a minute to arrive; check spam too.</FormMessage>
      </>
    );
  }

  return (
    <>
      <Heading title="Create your account" body={<>Three free preliminary scans every day. Already have an account? <Link href="/login" className="text-accent hover:underline">Log in</Link></>} />
      {google && (
        <>
          <GoogleButton next={next} />
          <Divider />
        </>
      )}
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (password.length < 8) return setError("Use a password of at least 8 characters.");
          setLoading(true);
          const { data, error } = await createClient().auth.signUp({
            email,
            password,
            options: {
              data: { display_name: name.trim() },
              emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
            },
          });
          setLoading(false);
          if (error) return setError(friendly(error.message));
          if (data.user && data.user.identities?.length === 0) {
            return setError("An account with this email already exists. Try logging in.");
          }
          track("signup_completed");
          setDone(true);
        }}
      >
        <Field label="Name" htmlFor="name" hint="Optional. Shown only to you.">
          <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <FormMessage>{error}</FormMessage>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Create account
        </Button>
        <p className="text-center text-[12px] leading-relaxed text-fg-subtle">
          By continuing you agree to the <Link href="/terms" className="underline">Terms</Link> and{" "}
          <Link href="/academic-integrity" className="underline">academic integrity policy</Link>.
        </p>
      </form>
    </>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <>
      <Heading title="Reset your password" body="We'll email you a link to set a new one." />
      {sent ? (
        <FormMessage tone="success">If an account exists for {email}, a reset link is on its way.</FormMessage>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError(null);
            const { error } = await createClient().auth.resetPasswordForEmail(email, {
              redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
            });
            setLoading(false);
            if (error) return setError(friendly(error.message));
            setSent(true);
          }}
        >
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <FormMessage>{error}</FormMessage>
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-[13px] text-fg-muted">
        <Link href="/login" className="hover:text-fg">Back to log in</Link>
      </p>
    </>
  );
}

export function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <>
      <Heading title="Choose a new password" body="You're signed in through your reset link." />
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < 8) return setError("Use a password of at least 8 characters.");
          setLoading(true);
          const { error } = await createClient().auth.updateUser({ password });
          setLoading(false);
          if (error) return setError(error.message.includes("session") ? "Your reset link has expired. Request a new one." : friendly(error.message));
          router.replace("/dashboard");
        }}
      >
        <Field label="New password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <FormMessage>{error}</FormMessage>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Update password
        </Button>
      </form>
    </>
  );
}
