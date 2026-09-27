export type RiskLevel = "low" | "moderate" | "elevated";

export type SignalId =
  | "sentence_variation"
  | "structural_repetition"
  | "transition_patterns"
  | "phrase_uniformity"
  | "lexical_diversity"
  | "paragraph_consistency";

export interface Signal {
  id: SignalId;
  label: string;
  /** 0–100. Higher means more of the regularity that detectors tend to flag. Null when the text is too short to measure. */
  score: number | null;
  level: RiskLevel | null;
  /** Plain-language measurement, e.g. "Sentence lengths vary by ±4 words". */
  measurement: string;
  explanation: string;
}

export interface ParagraphSignal {
  index: number;
  excerpt: string;
  words: number;
  level: RiskLevel;
  notes: string[];
}

/** One sentence of the input with the patterns found in it. */
export interface SentenceSignal {
  paragraph: number;
  text: string;
  level: RiskLevel;
  /** Why it was flagged, e.g. "Opens with “Moreover”". Empty for low. */
  reasons: string[];
}

/** Standard readability measures. Formulas are for English prose. */
export interface Readability {
  /** Flesch Reading Ease, 0–100 (higher is easier). */
  readingEase: number | null;
  /** Flesch–Kincaid grade level. */
  gradeLevel: number | null;
  avgSentenceWords: number;
  avgWordSyllables: number;
  /** Sentences over 35 words. */
  longSentences: number;
  /** At 238 words per minute. */
  readingMinutes: number;
}

export interface AnalysisResult {
  overallRisk: RiskLevel;
  signals: Signal[];
  paragraphs: ParagraphSignal[];
  /**
   * Sentence-level highlights. They contain the user's text, so they are only
   * returned to the browser and never saved (see `forStorage`). Missing on
   * saved results.
   */
  sentences?: SentenceSignal[];
  readability?: Readability;
  recommendations: string[];
  metadata: {
    analyzer: string;
    version: string;
    words: number;
    sentences: number;
    paragraphs: number;
    /** True only for development mocks. The UI refuses to present these as real analysis. */
    isMock: boolean;
  };
}

/** Anything that can produce a preliminary analysis. The UI depends only on this. */
export interface WritingAnalyzer {
  readonly id: string;
  analyze(text: string): Promise<AnalysisResult>;
}

/**
 * The copy of a result that is saved to scan history. Anything containing the
 * user's own words (sentence highlights, paragraph excerpts) is removed, so
 * "your text isn't stored" stays true.
 */
export function forStorage(result: AnalysisResult): AnalysisResult {
  const { sentences: _omit, ...rest } = result;
  void _omit;
  return { ...rest, paragraphs: result.paragraphs.map((p) => ({ ...p, excerpt: "" })) };
}
