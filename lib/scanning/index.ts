import "server-only";
import { HeuristicWritingAnalyzer } from "./heuristic-analyzer";
import type { WritingAnalyzer } from "./types";

/**
 * Pick the analyzer implementation. Add new ones (a trained model, an LLM
 * rubric, an external API) behind the same WritingAnalyzer interface; the
 * scan UI does not change.
 */
export function getAnalyzer(): WritingAnalyzer {
  switch (process.env.WRITING_ANALYZER ?? "heuristic") {
    case "heuristic":
    default:
      return new HeuristicWritingAnalyzer();
  }
}

export type { WritingAnalyzer, AnalysisResult } from "./types";
