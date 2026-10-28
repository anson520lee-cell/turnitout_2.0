import { COUNTED_CURVE, overallFor, type AutoReportResult, type ReportParagraph } from "@/lib/auto-report/stitch";
import { buildItems, knownNames, pickFlagged, type ReportRewrite } from "@/lib/auto-report/rewrite";
import { splitSentences } from "@/lib/recheck";

/**
 * A made-up essay written the way a chatbot writes one, rated High in every sentence, so the live rewrite starts
 * from 100%. Made-up ratings and made-up suggestions; no customer text and no real model call. Five suggestions are
 * refused by the checks on purpose, so a few sentences stay as written and the rate lands on a real projection
 * (about 8%) instead of zero.
 */
export const ai100Text = `In today's rapidly evolving digital landscape, technology has become an integral part of modern education. From interactive whiteboards to online learning platforms, digital tools have fundamentally transformed the way students learn and teachers teach. This transformation has sparked considerable debate among educators, policymakers and parents alike. While some argue that technology enhances learning outcomes, others express concerns about its potential drawbacks. This essay will explore both the benefits and challenges of integrating technology into the classroom.

One of the most significant advantages of educational technology is its ability to personalise learning. Adaptive learning platforms tailor content to each student's individual pace and learning style, ensuring that no learner is left behind. Furthermore, technology provides students with access to a vast array of resources that were previously unavailable. Online libraries, educational videos and virtual simulations enable learners to explore complex concepts in engaging and interactive ways. As a result, students are able to develop a deeper understanding of the subject matter.

In addition, technology plays a crucial role in fostering collaboration and communication skills. Digital platforms allow students to work together on projects regardless of their physical location. These collaborative experiences help students develop essential teamwork skills that are highly valued in the modern workforce. Moreover, technology equips students with the digital literacy needed to thrive in an increasingly interconnected world. It is therefore evident that technology offers numerous benefits for both students and educators.

However, it is important to acknowledge that the integration of technology in education is not without its challenges. One major concern is the digital divide, which refers to the gap between those who have access to technology and those who do not. Students from low-income families may lack reliable internet access or appropriate devices, which can exacerbate existing educational inequalities. Additionally, excessive screen time has been linked to a range of negative outcomes, including reduced attention spans and diminished social skills. Teachers may also struggle to keep pace with rapidly changing technologies without adequate training and support.

In conclusion, technology has the potential to revolutionise education by making learning more personalised, accessible and collaborative. Nevertheless, its successful implementation requires careful planning and a balanced approach. Policymakers and educators must work together to ensure that all students benefit equally from these advancements. Ultimately, technology should be viewed as a powerful tool that complements, rather than replaces, traditional teaching methods.`;

// Made-up reasons by sentence number; every sentence is rated High.
const WHY: Record<number, [why: string, ask: string]> = {
  1: ["Signals 1, 7: \"rapidly evolving digital landscape\" opener; stock template", "How would you open this if you were talking?"],
  2: ["Signals 1, 8: \"from X to Y\" list; \"fundamentally transformed\"", "Which of these tools have you used?"],
  3: ["Signals 4, 8: abstract debate, nobody named", "Who did you hear arguing about it?"],
  4: ["Signals 2, 7: \"some argue ... others\" frame", "What do you think yourself?"],
  5: ["Signal 7: \"This essay will explore\" road map", "Does the essay need this sentence?"],
  6: ["Signals 1, 8: \"one of the most significant advantages\"", "What made you think of this one first?"],
  7: ["Signals 3, 8: \"ensuring that no learner is left behind\"", "Have you seen this happen?"],
  8: ["Signals 2, 8: \"Furthermore\" opener; \"a vast array\"", "Which resources do you mean?"],
  9: ["Signals 3, 8: a list of three, then \"engaging and interactive\"", "Which one helped you?"],
  10: ["Signals 2, 7: \"As a result\" link; generic payoff", "What did you understand better?"],
  11: ["Signals 1, 2: \"In addition\"; \"plays a crucial role\"", "Can you say it without the stock phrase?"],
  12: ["Signals 4, 8: abstract, nobody named", "Where did you work on a project like this?"],
  13: ["Signals 1, 8: \"essential teamwork skills\"; \"modern workforce\"", "Who values these skills?"],
  14: ["Signals 1, 2: \"Moreover\"; \"thrive in an increasingly interconnected world\"", "What does this mean in everyday words?"],
  15: ["Signal 7: a summary sentence that adds nothing new", "What would you lose if you cut it?"],
  16: ["Signals 1, 2: \"it is important to acknowledge\"; \"not without its challenges\"", "Is this how you would say it out loud?"],
  17: ["Signals 7, 8: a dictionary definition dropped in", "Does the reader need the definition?"],
  18: ["Signals 4, 8: \"exacerbate existing educational inequalities\"", "Which students do you have in mind?"],
  19: ["Signals 2, 8: \"Additionally\"; \"a range of negative outcomes\"", "Linked by whom?"],
  20: ["Signals 4, 8: abstract, nobody named", "Which teachers?"],
  21: ["Signals 1, 7: \"In conclusion\"; \"revolutionise education\"", "How would you end this if you were talking?"],
  22: ["Signals 2, 8: \"Nevertheless\"; \"a balanced approach\"", "What would that look like?"],
  23: ["Signals 4, 8: \"must work together to ensure\"", "Who exactly needs to do what?"],
  24: ["Signals 1, 7: \"Ultimately\"; \"complements, rather than replaces\"", "Is this your own contrast?"],
};

const SUGGESTIONS: Record<number, string> = {
  1: "These days, technology is part of almost everything that happens in a school classroom.",
  2: "Smart whiteboards and online learning sites have changed a lot about how students learn and how teachers run their lessons.",
  3: "Teachers, policymakers and parents have argued quite a bit about whether this change is a good one.",
  4: "Some people say technology helps students learn more, while others worry about what it might cost them.",
  5: "In this essay I look at what goes well and what goes wrong when classrooms bring in technology.",
  6: "A big plus of technology in school is that it lets each student learn in a way that suits them.",
  // Refused on purpose: the checks keep the sentence as written (each fails a different check).
  7: "Adaptive learning apps give each student work at their own speed and in their own way, so nobody gets left behind.",
  8: "Students can also reach far more material than they ever could before, all from a laptop or phone.",
  9: "With online libraries, videos and simulations, students can poke around hard ideas in a way that actually holds their interest.",
  10: "That way, students get to understand the topic much more deeply than before.",
  11: "Technology also helps students get better at working with others and getting their ideas across.",
  12: "Students can work on projects together online even if they are not in the same place.",
  13: "Working this way builds the kind of teamwork that employers look for when they hire people today.",
  14: "Using it every day also teaches students how to find their way around online, which matters more each year.",
  15: "So technology always helps students and teachers in a lot of different ways.",
  16: "Still, bringing technology into schools is not as simple as it sounds, and it comes with real problems.",
  17: "A big worry is the digital divide, the gap between people who have the technology they need and people who do not.",
  18: "Students from poorer homes may be stuck with slow internet or old devices, which can make the gaps already there between students even wider.",
  19: "Too much screen time also leads to shorter attention spans and weaker social skills in a lot of students.",
  20: "Teachers may also find it hard to keep up with new tools when nobody trains them or helps them out.",
  21: "Overall, technology could really change schools by making learning fit each student, easier to get to, and more of a group effort.",
  22: "But getting it right takes careful planning and a sense of when to use it and when to leave it out.",
  23: "Everyone has to help so all students gain.",
  24: "In the end, technology works best as a useful tool that adds to good old-fashioned teaching instead of taking its place.",
};

export function ai100Result(): AutoReportResult {
  const all = splitSentences(ai100Text);
  const paragraphs: ReportParagraph[] = [];
  all.forEach((s, i) => {
    const n = i + 1;
    let para = paragraphs[paragraphs.length - 1];
    if (!para || para.p !== s.p) {
      para = { p: s.p, risk: "high", sentences: [] };
      paragraphs.push(para);
    }
    const [why, ask] = WHY[n] ?? ["Signal 8: predictable wording", "Is this your wording?"];
    para.sentences.push({ n, text: s.text, risk: "high", why, ask, counts: true });
  });
  const sentences = all.length;
  return {
    version: 1,
    pieces: { total: 1, reviewed: 1 },
    summary: {
      words: ai100Text.split(/\s+/).length,
      sentences,
      paragraphs: paragraphs.length,
      high: sentences,
      medium: 0,
      uncertain: 0,
      flaggedShare: 1,
      riskyParagraphs: paragraphs.length,
      counted: sentences,
      countedShare: 1,
      overall: overallFor(1, COUNTED_CURVE),
    },
    paragraphs,
    grammar: [],
  };
}

export function ai100Rewrite(result: AutoReportResult): ReportRewrite {
  const answers = new Map(Object.entries(SUGGESTIONS).map(([n, t]) => [Number(n), t]));
  return { version: 1, model: "preview", createdAt: "2026-10-27T00:00:00.000Z", credits: 0, items: buildItems(pickFlagged(result), answers, knownNames(result)) };
}
