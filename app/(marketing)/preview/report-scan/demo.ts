import { overallFor, type AutoReportResult, type Level, type ReportParagraph } from "@/lib/auto-report/stitch";
import { splitSentences } from "@/lib/recheck";

/**
 * A made-up essay and made-up ratings for the live-scan design preview. No
 * customer text and no real review: it only lets the scan be looked at
 * without paying for a report.
 */
export const demoText = `Urban transport has long been shaped by the pursuit of speed. Faster journeys are widely regarded as beneficial for economic growth, and for most of the last century city planners measured success in minutes saved. However, speed alone does not guarantee that people can reach what they need. My own commute got faster after the new line opened, but my weekly shop still takes an hour.

When I moved flats last year, I stopped caring how fast the bus was. What mattered was whether the market, the clinic and my cousin's place were all within a short walk. Accessibility is therefore a more meaningful measure of urban quality than mobility. That is hard to see on a map, but easy to feel on a Saturday morning with two bags of vegetables and a broken umbrella.

Planners can respond to this in several ways. They can mix homes, shops and workplaces within walking distance, which shortens trips before any road is built. Hong Kong's stations, with flats above and shops below, are the example I know best, and they work because you rarely need a car. Streets can also be redesigned to give pedestrians more room, with wider pavements, more crossings and shade from trees.

Furthermore, the benefits of accessible neighbourhoods extend beyond convenience. Shorter trips reduce emissions, improve air quality and encourage physical activity, all of which contribute to better public health outcomes. In addition, local shops and services foster a sense of community and social cohesion. These factors collectively demonstrate that accessibility should be a central consideration in contemporary urban planning.

None of this is free, of course. Land near stations is expensive, and developers prefer offices to clinics because offices pay more rent. My district lost its post office two years ago for exactly that reason, and now my grandmother takes a minibus to send a parcel. A city that only counts minutes will not notice that kind of loss, because her trip is fast, it is just far.

It is important to note that measuring accessibility presents significant methodological challenges. Researchers must account for diverse population needs, varying travel preferences and the complex interplay between land use and transport networks. Nevertheless, recent advances in data collection and spatial analysis have made such measurement increasingly feasible. Consequently, policymakers now have the tools necessary to prioritise accessibility in decision-making processes.

Still, tools are not the same as will. I think the real test is whether a planning committee would give up a fast road for a slow street full of shops. In my experience the answer is usually no, because a road is easy to show in a brochure and a good street is not. That is the habit we need to break.

In conclusion, a city is not judged by how quickly people can move through it but by how easily they can live in it. Speed has its place, yet it should serve accessibility rather than replace it. Fast roads help, but I would not start there. I would start with the walk to the market.`;

type Rating = { risk: Level; why?: string; ask?: string };

// Made-up ratings by sentence number, for the preview only.
const RATINGS: Record<number, Rating> = {
  1: { risk: "high", why: "Signals 1, 4: a ready-made opening; abstract, nobody named", ask: "Who was pursuing speed, and why?" },
  2: { risk: "high", why: "Signals 1, 4: stock academic phrasing; no person and no example", ask: "Widely regarded by whom?" },
  3: { risk: "medium", why: "Signal 2: a standard \"however\" turn", ask: "Is this how you would say it out loud?" },
  7: { risk: "medium", why: "Signal 1: a textbook conclusion frame", ask: "Which part of your own story does this rest on?" },
  10: { risk: "medium", why: "Signal 1: ready-made planning collocations", ask: "Which of these did you actually see in your city?" },
  12: { risk: "uncertain", why: "Tidy, but it may follow a course handout closely", ask: "Is this your wording or the handout's?" },
  13: { risk: "high", why: "Signals 2, 3: \"Furthermore\" opener; claim with no example", ask: "What made you think of this?" },
  14: { risk: "high", why: "Signals 3, 5: a list of three generic benefits", ask: "Which one of these have you seen yourself?" },
  15: { risk: "high", why: "Signals 2, 4: \"In addition\" opener; abstract nouns", ask: "Which shop or service do you mean?" },
  16: { risk: "high", why: "Signal 1: a summary sentence that adds nothing new", ask: "What would you lose if you cut it?" },
  21: { risk: "high", why: "Signals 1, 2: \"It is important to note\" frame", ask: "Who finds it hard to measure, and why?" },
  22: { risk: "high", why: "Signals 3, 4: three abstract needs in a row", ask: "Can you name one real case?" },
  23: { risk: "medium", why: "Signal 2: \"Nevertheless\" turn; vague \"recent advances\"", ask: "Which advances do you mean?" },
  24: { risk: "high", why: "Signals 2, 4: \"Consequently\" link; no person named", ask: "Which policymakers?" },
  29: { risk: "medium", why: "Signal 1: a stock \"In conclusion\" opening", ask: "How would you end this if you were talking?" },
  30: { risk: "uncertain", why: "Balanced, but close to a stock phrase", ask: "Is this your own contrast?" },
};

export function demoResult(): AutoReportResult {
  const all = splitSentences(demoText);
  const paragraphs: ReportParagraph[] = [];
  all.forEach((s, i) => {
    const n = i + 1;
    let para = paragraphs[paragraphs.length - 1];
    if (!para || para.p !== s.p) {
      para = { p: s.p, risk: "low", sentences: [] };
      paragraphs.push(para);
    }
    const r = RATINGS[n];
    para.sentences.push({ n, text: s.text, risk: r?.risk ?? "low", ...(r?.why ? { why: r.why } : {}), ...(r?.ask ? { ask: r.ask } : {}) });
  });
  for (const p of paragraphs) {
    const flagged = p.sentences.filter((x) => x.risk === "high" || x.risk === "medium").length;
    p.risk = flagged >= 3 ? "high" : flagged === 2 ? "medium" : "low";
  }
  const list = paragraphs.flatMap((p) => p.sentences);
  const count = (r: Level) => list.filter((x) => x.risk === r).length;
  const flaggedShare = (count("high") + count("medium")) / list.length;
  return {
    version: 1,
    pieces: { total: 1, reviewed: 1 },
    summary: {
      words: demoText.split(/\s+/).length,
      sentences: list.length,
      paragraphs: paragraphs.length,
      high: count("high"),
      medium: count("medium"),
      uncertain: count("uncertain"),
      flaggedShare,
      riskyParagraphs: paragraphs.filter((p) => p.risk === "high" || p.risk === "medium").length,
      overall: overallFor(flaggedShare),
    },
    paragraphs,
    grammar: [{ n: 20, text: list[19].text, issue: "comma splice: \"her trip is fast, it is just far\"" }],
  };
}
