import { redirect } from "next/navigation";

/** The orders list now lives in Activity (with uploads). Old links and filters keep working. */
export default async function AdminOrders({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams;
  const next = new URLSearchParams({ kind: "orders" });
  for (const k of ["status", "q"]) if (typeof sp[k] === "string" && sp[k]) next.set(k, sp[k]);
  redirect(`/admin/activity?${next}`);
}
