export default function Loading() {
  return (
    <div role="status" className="flex items-center gap-3 py-6 text-sm text-fg-muted">
      <span aria-hidden className="size-4 rounded-full border-2 border-accent border-r-transparent motion-safe:animate-spin" />
      Loading page…
    </div>
  );
}
