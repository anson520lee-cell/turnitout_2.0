import { redirect } from "next/navigation";

/** Uploaded documents and free scans are listed in Activity now. */
export default function AdminSubmissions() {
  redirect("/admin/activity");
}
