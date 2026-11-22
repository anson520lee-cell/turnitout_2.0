import type { ReactNode } from "react";

/**
 * Page header inside the signed-in app (and the report form, which guests
 * see in the public shell): a mono label after a short hairline, the title
 * rising out of its slot, and a hairline under it that draws out from the
 * left. Quicker than the public headers: this is where people work.
 */
export function AppHeader({ title, body, actions, eyebrow }: { title: ReactNode; body?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="app-head mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-3">
            {eyebrow ?? (
              <p className="app-eyebrow">
                <span>Workspace</span>
              </p>
            )}
          </div>
          <h1 className="app-h1 app-title text-2xl font-semibold tracking-tight sm:text-[28px]">
            <span className="lh-line">
              <span>{title}</span>
            </span>
          </h1>
          {body && <p className="app-lead mt-1.5 max-w-2xl text-[14px] text-fg-muted">{body}</p>}
        </div>
        {actions && <div className="app-actions flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div aria-hidden className="app-rule mt-6" />
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="app-empty flex flex-col items-center px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-full border border-[var(--line-strong)] text-accent">{icon}</div>
      <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[13.5px] text-fg-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
