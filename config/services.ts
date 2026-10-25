import {
  formatCredits,
  refinementPricing,
  reportPricing,
  type ServiceType,
} from "./pricing";
import { freeReport } from "./app";

export type ServiceKind = "screening" | "refinement";

export interface ServiceDefinition {
  id: ServiceType;
  kind: ServiceKind;
  name: string;
  short: string;
  priceLabel: string;
  cadence?: string;
  features: string[];
  href: string;
  cta: string;
  highlight?: boolean;
}

/**
 * The one report product. `ai_screening` and `similarity_screening` stay in
 * the enum so older orders still render, but they are no longer offered.
 */
export const reportService = "combined_screening" as const;

export const serviceLabels: Record<ServiceType, string> = {
  ai_screening: "AI-Writing Screening",
  similarity_screening: "Similarity Screening",
  combined_screening: "AI-Writing Risk Report",
  refinement: "Writing Refinement",
};

export const reportRangeLabel = `${reportPricing.minChars.toLocaleString("en-HK")}–${reportPricing.maxChars.toLocaleString("en-HK")} characters`;

/** "1 credit per 1,000 characters". */
export const reportRateLabel = `${formatCredits(reportPricing.perBlock)} per ${reportPricing.blockChars.toLocaleString("en-HK")} characters`;

/** "Minimum 2 credits (2,000 characters)". */
export const reportMinimumLabel = `Minimum ${formatCredits(reportPricing.minimum)} (${(
  (reportPricing.minimum / reportPricing.perBlock) *
  reportPricing.blockChars
).toLocaleString("en-HK")} characters)`;

/** "In every 20,000 characters, the first 8,000 are charged and the next 12,000 are free". */
export const reportCycleLabel = `In every ${reportPricing.cycleChars.toLocaleString("en-HK")} characters, the first ${reportPricing.chargedChars.toLocaleString("en-HK")} are charged and the next ${(
  reportPricing.cycleChars - reportPricing.chargedChars
).toLocaleString("en-HK")} are free`;

/** "Minimum 2 credits (2,000 characters); in every 20,000 characters, the first 8,000 are charged and the next 12,000 are free". */
export const reportLimitsLabel = `${reportMinimumLabel}; ${reportCycleLabel.charAt(0).toLowerCase()}${reportCycleLabel.slice(1)}`;

/** "From 2 credits". */
export const reportFromLabel = `From ${formatCredits(reportPricing.minimum)}`;

export const refinementRateLabel = `${formatCredits(refinementPricing.perBlock)} per ${refinementPricing.blockChars.toLocaleString("en-HK")} characters`;

/** "Minimum 3 credits (3,000 characters)". */
export const refinementMinimumLabel = `Minimum ${formatCredits(refinementPricing.minimum)} (${(
  (refinementPricing.minimum / refinementPricing.perBlock) *
  refinementPricing.blockChars
).toLocaleString("en-HK")} characters)`;

export const services: ServiceDefinition[] = [
  {
    id: reportService,
    kind: "screening",
    name: serviceLabels[reportService],
    short: "A full AI-writing risk report on your own text, made by this website in a few minutes.",
    priceLabel: reportFromLabel,
    cadence: reportRateLabel,
    features: [
      `1 free report a day, up to ${freeReport.maxChars.toLocaleString("en-HK")} characters`,
      "Overall risk level",
      "A map of every paragraph",
      "Marked sentences, with a question to ask yourself",
      "Grammar spots, location only",
      "PDF download",
      reportLimitsLabel,
    ],
    href: "/services/screening",
    cta: "Get report",
    highlight: true,
  },
  {
    id: "refinement",
    kind: "refinement",
    name: "Writing Refinement",
    short: "Clarity, flow and style refinement of your own writing, checked by our team.",
    priceLabel: `From ${formatCredits(refinementPricing.minimum)}`,
    cadence: refinementRateLabel,
    features: [
      "Clarity, flow and style",
      "Meaning and citations preserved",
      "Your voice retained",
      refinementMinimumLabel,
    ],
    href: "/services/refinement",
    cta: "Refine my writing",
  },
];

export const disclaimers = {
  turnitin:
    "This platform is independently operated and is not affiliated with, endorsed by, or operated by Turnitin or any AI-detection provider. Nothing here is a Turnitin result.",
  screeningResult:
    "This report is written by an automated reviewer from the text you submitted. Its ratings are guidance, can be wrong in both directions, and are not, on their own, proof of authorship.",
  noGuarantee:
    "We do not guarantee any particular AI-writing result or outcome.",
  refinement:
    "Writing Refinement improves the clarity, flow and style of your own writing. It is not a service for disguising AI-generated or third-party work.",
} as const;
