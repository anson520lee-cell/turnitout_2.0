import { test } from "node:test";
import assert from "node:assert/strict";
import { CITATION_RULE, REWRITE_PROMPT, checkRewrite, lockedIn } from "../lib/auto-report/rewrite";

const cited = "Social media may slightly raise anxiety among some teenagers (Smith, 2021).";

test("a bracketed citation must come through as written", () => {
  assert.equal(checkRewrite(cited, "Honestly, social media may nudge anxiety up for some teenagers (Smith, 2021)."), null);
  assert.match(checkRewrite(cited, "Honestly, social media may nudge anxiety up for some teenagers (Smith et al., 2021).") ?? "", /citation or quotation/);
  assert.match(checkRewrite(cited, "Honestly, social media may nudge anxiety up for some teenagers.") ?? "", /citation or quotation/);
  assert.match(checkRewrite("Teen anxiety rose sharply (Smith, 2021, p. 45).", "Teen anxiety went up a lot (Smith, 2021, p. 54).") ?? "", /number|citation/);
  assert.match(checkRewrite("Teen anxiety rose sharply (Smith, n.d.).", "Teen anxiety went up a lot of the time.") ?? "", /citation or quotation/);
  assert.match(checkRewrite("Teen anxiety rose sharply（Smith, 2021）.", "Teen anxiety went up a lot of the time.") ?? "", /citation or quotation/);
});

test("a narrative citation keeps its author with the year", () => {
  const o = "Smith (2021) found that social media slightly raises anxiety among some teenagers.";
  assert.deepEqual(lockedIn(o), ["Smith (2021)"]);
  assert.equal(checkRewrite(o, "Smith (2021) found that some teenagers get a bit more anxious on social media."), null);
  assert.match(checkRewrite(o, "One study (2021) found that some teenagers get a bit more anxious on social media.") ?? "", /citation or quotation/);
  assert.match(checkRewrite("According to Smith (2021), social media raises anxiety among some teenagers.", "According to one study (2021), social media raises anxiety among some teenagers.") ?? "", /citation or quotation/);
  assert.deepEqual(lockedIn("Smith and Lee (2020, p. 4) and Wong et al. (2019) agree."), ["Smith and Lee (2020, p. 4)", "Wong et al. (2019)"]);
});

test("a word before a bracketed citation is not part of it", () => {
  assert.deepEqual(lockedIn("Anxiety (Smith, 2021) rises."), ["(Smith, 2021)"]);
  assert.deepEqual(lockedIn("The results (see Table 2) were mixed."), []);
});

test("numbered citations and single-quoted quotations are locked too", () => {
  assert.deepEqual(lockedIn("Anxiety rises [1], [2, 3] and [4-6]."), ["[1]", "[2, 3]", "[4-6]"]);
  assert.match(checkRewrite("Social media raises anxiety among teenagers [1].", "Honestly, social media makes a lot of teenagers more anxious.") ?? "", /citation or quotation/);
  assert.match(checkRewrite("Social media raises anxiety among teenagers [1].", "Honestly, social media makes a lot of teenagers more anxious [2].") ?? "", /number|citation/);
  const q = "Smith calls it 'a quiet epidemic of comparison' among young people.";
  assert.deepEqual(lockedIn(q), ["a quiet epidemic of comparison"]);
  assert.match(checkRewrite(q, "Smith calls it a kind of epidemic of comparing yourself, among young people.") ?? "", /citation or quotation/);
  assert.deepEqual(lockedIn("The students' work and the teachers' views differ, and it's 'fine'."), ["fine"]);
});

test("the writer is told to keep what a citation claims", () => {
  assert.match(CITATION_RULE, /keep what the citation claims/);
  assert.match(REWRITE_PROMPT, /Keep every in-text citation/);
});
