import { redirect } from "next/navigation";

/** Uploaded documents are listed in Activity now. */
export default function AdminSubmissions() {
  redirect("/admin/activity");
}
