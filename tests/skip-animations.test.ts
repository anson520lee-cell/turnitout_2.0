import { test } from "node:test";
import assert from "node:assert/strict";
import { canSkipAnimations } from "../lib/auth/skip-animations";

const user = (email: string, role: string) => ({ email, profile: { role } });

test("only the named admin account can skip animations", () => {
  assert.equal(canSkipAnimations(user("anson520lee@gmail.com", "admin")), true);
  assert.equal(canSkipAnimations(user("Anson520Lee@Gmail.com", "admin")), true);
});

test("other admins, the same email without admin, and signed-out visitors cannot", () => {
  assert.equal(canSkipAnimations(user("someone@gmail.com", "admin")), false);
  assert.equal(canSkipAnimations(user("anson520lee@gmail.com", "user")), false);
  assert.equal(canSkipAnimations(user("anson520lee@gmail.com.evil.com", "admin")), false);
  assert.equal(canSkipAnimations(null), false);
});
