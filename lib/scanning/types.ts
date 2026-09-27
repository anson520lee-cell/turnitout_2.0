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

export interface AnalysisResult {
  overallRisk: RiskLevel;
  signals: Signal[];
  paragraphs: ParagraphSignal[];
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
