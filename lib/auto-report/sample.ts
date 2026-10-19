import type { AutoReportResult, Level, ReportParagraph } from "./stitch";

/** Example data for the sample-report page. Made up for illustration; no customer and no real document. */
const s = (n: number, text: string, risk: Level = "low", why?: string, ask?: string) => ({ n, text, risk, ...(why ? { why } : {}), ...(ask ? { ask } : {}) });

const paragraphs: ReportParagraph[] = [
  {
    p: 1,
    risk: "high",
    note: "Three tidy, impersonal sentences in a row, with nothing in between that sounds like you.",
    sentences: [
      s(1, "Urban transport has long been shaped by the pursuit of speed.", "high", "Signals 1, 4: a ready-made opening; abstract, nobody named", "Who was pursuing speed, and why? How would you open this if you were telling a friend?"),
      s(2, "Faster journeys are widely regarded as beneficial for economic growth.", "high", "Signals 1, 4: stock academic phrasing; no person and no example", "Widely regarded by whom?"),
      s(3, "However, speed alone does not guarantee that people can reach what they need.", "medium", "Signal 2: a standard \"X, however Y\" frame", "Is this how you would say it out loud?"),
      s(4, "My own commute got faster after the new line opened, but my weekly shop still takes an hour."),
    ],
  },
  {
    p: 2,
    risk: "low",
    note: "One sentence is marked, and the sentences around it are clearly in your own voice.",
    sentences: [
      s(5, "When I moved flats last year, I stopped caring how fast the bus was."),
      s(6, "What mattered was whether the market, the clinic and my cousin's place were all within a short walk."),
      s(7, "Accessibility is therefore a more meaningful measure of urban quality than mobility.", "medium", "Signal 1: a textbook conclusion frame", "Which part of your own story does this sentence rest on?"),
      s(8, "That is hard to see on a map, but easy to feel on a Saturday."),
    ],
  },
  {
    p: 3,
    risk: "medium",
    sentences: [
      s(9, "Planners can respond in several ways."),
      s(10, "They can mix homes, shops and workplaces within walking distance, which shortens trips before any road is built.", "medium", "Signal 1: ready-made planning collocations", "Which of these ideas did you actually see in your own city?"),
      s(11, "Hong Kong's stations, with flats above and shops below, are the example I know best, and they work because you rarely need a car."),
      s(12, "Streets can be redesigned to give pedestrians more room.", "uncertain", "Tidy, but it may follow your course handout closely", "Is this your own wording or the handout's?"),
    ],
  },
  {
    p: 4,
    risk: "low",
    sentences: [
      s(13, "In the end, I think a good city is one where the short trip is the easy trip."),
      s(14, "Fast roads help, but I would not start there."),
    ],
  },
];

const marked = paragraphs.flatMap((p) => p.sentences);
const count = (r: Level) => marked.filter((x) => x.risk === r).length;

export const sampleReport: AutoReportResult = {
  version: 1,
  pieces: { total: 1, reviewed: 1 },
  summary: {
    words: 210,
    sentences: marked.length,
    paragraphs: paragraphs.length,
    high: count("high"),
    medium: count("medium"),
    uncertain: count("uncertain"),
    flaggedShare: (count("high") + count("medium")) / marked.length,
    riskyParagraphs: paragraphs.filter((p) => p.risk === "high" || p.risk === "medium").length,
    overall: "moderate",
  },
  paragraphs,
  grammar: [{ n: 11, text: marked[10].text, issue: "comma use: check the commas around \"with flats above and shops below\"" }],
};
