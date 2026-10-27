import { brand, freeReport } from "./app";
import { retentionSentence } from "./privacy-copy";
import { disclaimers, reportLimitsLabel, reportRangeLabel, reportRateLabel } from "./services";

export interface FaqItem {
  q: string;
  a: string;
}

export const faq: FaqItem[] = [
  {
    q: "What is the report?",
    a: `You paste your text, and an automated reviewer reads every sentence and paragraph of it and writes a full AI-writing risk report, ready in a few minutes, with a PDF to download. Every account gets one report a day free (see below); more are paid with credits, or by Alipay for just that one report at its exact price.`,
  },
  {
    q: "Is the report Turnitin?",
    a: "No. The report is produced entirely by this website and never touches Turnitin.",
  },
  {
    q: "What does the report include?",
    a: "An overall risk level for your whole text, a map of every paragraph from low to high risk, the sentences that read most like AI writing with a question to ask yourself about each, and grammar spots (where and what kind, never a rewrite). It does not give a similarity percentage and it is not a Turnitin result.",
  },
  {
    q: "How much does it cost?",
    a: `A report is ${reportRateLabel}, rounded up, for texts of ${reportRangeLabel}. ${reportLimitsLabel}. Your daily free report costs nothing.`,
  },
  {
    q: "How do I submit my text?",
    a: "Press the button on the report page, paste your text into the box and press Enter. You can also load a .docx, .pdf or .txt file into the box; the text is extracted in your browser. You then pay for it with credits on the order page.",
  },
  {
    q: "How do credits work?",
    a: `Everything is paid for with credits (8 credits = US$1). Top up on the Billing & Credits page with crypto (USDT, USDC or BTC), PayPal or Alipay. Crypto credits are added automatically once the payment is confirmed. For PayPal or Alipay, scan the QR code, send the amount (Alipay is paid in Hong Kong dollars), then enter your PayPal or Alipay transaction ID; we confirm it by hand and add the credits as soon as it is confirmed. Larger top-ups come with bonus credits (see Pricing). Then pay for a report with one click on its order page.`,
  },
  {
    q: "Are you affiliated with Turnitin?",
    a: `No. ${disclaimers.turnitin}`,
  },
  {
    q: "Is my text added to Turnitin or any paper database?",
    a: "No. The report is made by this website's own reviewer, so your text is never sent to Turnitin or added to any paper repository. To write the report, the text is sent to an outside AI provider (DeepSeek), which is named in the privacy policy.",
  },
  {
    q: "Can AI-writing detectors make mistakes?",
    a: "Yes. Automated AI-writing indicators can flag genuinely human writing, particularly formal, formulaic or second-language writing. No indicator, including ours, proves who wrote a text.",
  },
  {
    q: "Can you guarantee a specific AI score?",
    a: `No. ${disclaimers.noGuarantee} A screening result reflects one run at one point in time.`,
  },
  {
    q: "What happens to my text after the report?",
    a: `Your text is kept in our database where only you and authorised staff can see it. ${retentionSentence.source} ${retentionSentence.reports} ${retentionSentence.unpaid} You can ask us to delete them sooner at ${brand.supportEmail}.`,
  },
  {
    q: "How long is my text stored?",
    a: `${retentionSentence.source} ${retentionSentence.reports}`,
  },
  {
    q: "How long does a report take?",
    a: "About a minute for a long text. It starts as soon as you pay, you can watch the progress on your order page, and if you close the page it carries on where it stopped when you come back.",
  },
  {
    q: "What is the daily free report?",
    a: `Every signed-in account gets ${freeReport.dailyLimit} full report a day for free, for texts of up to ${freeReport.maxChars.toLocaleString("en-HK")} characters. It is the same automatic report as a paid one: the live scan, the AI score, every sentence rated with its reason, the paragraph map and a PDF. It resets at midnight Hong Kong time. To stop one person making many accounts, free reports are also counted by a one-way hash of the network address, so the address itself is never stored.`,
  },
  {
    q: "What is Writing Refinement?",
    a: "An optional add-on you can use once on a finished report. It suggests a rewrite for each flagged sentence, answering the reviewer's reason while keeping your facts, numbers, names, quotations and citations. You see your sentence beside the suggestion and choose one by one. It is charged in credits at the same price as the report, only when suggestions are ready, and it does not guarantee any result in any checker. Find it at the bottom of your finished report page.",
  },
];
