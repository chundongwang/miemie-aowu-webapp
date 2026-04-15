// IELTS-level vocabulary, sourced from the IELTS Word List
// (github.com/fanhongtao/IELTS) and supplemented with common band 6-8 words.
export const IELTS_WORDS: string[] = [
  // A
  "abolish","absurd","abundant","accelerate","accommodate","accumulate","accurate",
  "acquiesce","adamant","adapt","adequate","adjacent","adversity","aesthetic",
  "aggravate","alleviate","ambiguous","ambivalent","amplify","anecdote","antagonize",
  "anticipate","apprehensive","arbitrary","articulate","assert","assess","attribute",
  "augment","authentic","avert",
  // B
  "beneficial","bewildering","bias","brevity","bureaucracy","burgeon",
  // C
  "candid","capricious","catastrophe","chronic","coherent","collaborate","compel",
  "comprehensive","compromise","concede","connotation","constitute","contemplate",
  "contentious","controversial","converge","corroborate","credibility","criterion",
  "cumulative","cynical",
  // D
  "debilitate","deduce","deliberate","deplete","deteriorate","detrimental","deviate",
  "dilemma","diligent","discern","discrepancy","disparity","dominant","dubious",
  // E
  "eloquent","empirical","endorse","enigmatic","enmity","erode","erratic","escalate",
  "esoteric","exacerbate","exemplify","explicit","exploit",
  // F
  "facilitate","finite","fluctuate","formidable","formulate","fragile","flaw",
  // G
  "generate","genuine","gregarious",
  // H
  "hierarchy","hypothesis",
  // I
  "illuminate","imminent","impartial","impede","implicit","incentive","indifferent",
  "inevitable","inexplicable","infrastructure","inherent","innate","innovative",
  "integrate","integrity","intrinsic",
  // J
  "jeopardize","justify",
  // L
  "legitimate","lenient","lucid",
  // M
  "manifold","meticulous","mitigate","morale","mutual",
  // N
  "negligent","neutral","nuance",
  // O
  "obscure","obstruct","obsolete","optimistic","overlap",
  // P
  "paradox","perceive","persevere","pessimistic","phenomenon","plausible",
  "pragmatic","preconceived","prejudice","prevalent","profound","prolong",
  "propagate","propel","prudent",
  // R
  "rationalize","refute","reinforce","reluctant","remedy","resilient","rigorous",
  // S
  "scrutinize","skeptical","spontaneous","stimulate","subordinate","subsequent",
  "subtle","suppress","synthetic",
  // T
  "tangible","tenacious","tenuous","tolerance","transparent","trivial",
  // U
  "unanimous","undermine","uniform","underlying",
  // V
  "validate","versatile","viable","vehement","vindicate","volatile","vulnerable",
  // W
  "welfare",
  // More intermediate-advanced IELTS words
  "abrupt","accentuate","accountability","accomplish","aloof","anachronism",
  "annihilate","anomaly","apathy","appease","articulate","aspire","austere",
  "avid","baffle","benign","blunt","boisterous","candid","captivate","censure",
  "circumvent","clandestine","coerce","compassion","complacent","condescend",
  "conform","confront","conjecture","consolidate","contempt","contrite","conviction",
  "cultivate","curb","cynicism","daunting","deceptive","deference","denounce",
  "depict","derive","dignify","discredit","disdain","dismantle","dissonance",
  "diverse","eclipse","elusive","emulate","endure","enhance","enlighten","erode",
  "evade","exert","exhaustive","extravagant","fabricate","feign","fervent","fierce",
  "flourish","fluctuate","foster","frugal","fundamental","garner","gratitude",
  "grotesque","grudge","hamper","harness","hinder","hostile","humble","immense",
  "implicate","impose","improvise","incessant","indulge","inflict","insightful",
  "intense","intimidate","intricate","invigorate","isolate","keen","kindle","lament",
  "lavish","linger","loathe","lofty","longevity","lure","magnify","mandate",
  "marginalise","meager","mediate","menace","modest","mundane","naive","nominate",
  "notably","obscure","offset","ominous","oppress","optimise","ordeal","oscillate",
  "outrage","overcome","overwhelm","passive","perpetuate","persist","pervasive",
  "pledge","polarise","potential","precarious","precipitate","prestige","prohibit",
  "prompt","provoke","pursue","radical","recede","reconcile","rectify","refine",
  "regulate","reinstate","retaliate","reveal","revoke","rigidity","robust",
  "sacrifice","sceptical","scrutiny","sedentary","segregate","severity","shrewd",
  "simplify","soothe","sparse","speculate","stagnant","steadfast","stereotype",
  "stigma","strategic","strenuous","subjugate","substantial","summit","surge",
  "surpass","sympathise","taunt","terminate","tolerate","toxic","transcend",
  "turbulent","undermine","unprecedented","urge","vigilant","wane","yield",
];

export function pickRandomWord(): string {
  return IELTS_WORDS[Math.floor(Math.random() * IELTS_WORDS.length)];
}
