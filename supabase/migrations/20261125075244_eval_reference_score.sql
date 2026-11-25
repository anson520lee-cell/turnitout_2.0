-- The value displayed by Turnitin. "*" covers the suppressed 1–19% range.
-- NULL preserves older cases that recorded highlights only.
alter table public.eval_cases
  add column reference_score text
  check (reference_score is null or reference_score ~ '^(\*|0|[1-9][0-9]?|100)$');
