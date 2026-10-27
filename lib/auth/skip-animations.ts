/** The one account that may skip the report scan and Writing Refinement animations. */
const SKIP_ANIMATIONS_EMAIL = "anson520lee@gmail.com";

/**
 * Whether this user sees the "Skip animation" button. Called on the server with
 * the verified session (email from Supabase auth.getUser, role from the
 * database), never with anything the browser sends.
 */
export function canSkipAnimations(user: { email: string; profile: { role: string } } | null): boolean {
  return Boolean(user && user.profile.role === "admin" && user.email.trim().toLowerCase() === SKIP_ANIMATIONS_EMAIL);
}
