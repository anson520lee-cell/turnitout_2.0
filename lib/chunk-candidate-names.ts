/** Names of the candidate reviewer prompts (the texts are in chunk-prompts.ts, which is server-only). */
export const CANDIDATE_PROMPT_NAMES = ["strict1", "slip1", "struct1", "dense1"] as const;
export type CandidatePromptName = (typeof CANDIDATE_PROMPT_NAMES)[number];
