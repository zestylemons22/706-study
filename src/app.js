const DATA_URL = "data/study-data.json";
const STORAGE_KEY = "mecheng705-study-progress-v1";

let studyData = null;
let state = {
  route: "dashboard",
  topicId: null,
  query: "",
  showAnswer: false,
  quiz: null,
};

const app = document.querySelector("#app");

function loadProgress() {
  try {
    return normalizeProgress(JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return normalizeProgress(null);
  }
}

let progress = loadProgress();

function normalizeProgress(saved) {
  return {
    cards: saved?.cards || {},
    quizAttempts: Number(saved?.quizAttempts || 0),
    quizCorrect: Number(saved?.quizCorrect || 0),
    mistakes: Array.isArray(saved?.mistakes) ? saved.mistakes : [],
    decks: {
      flashcards: saved?.decks?.flashcards || {},
      quiz: saved?.decks?.quiz || {},
    },
  };
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function byId(id) {
  return document.getElementById(id);
}

function topicById(topicId) {
  return studyData.topics.find((topic) => topic.id === topicId) || studyData.topics[0];
}

function cardsForTopic(topicId = "all") {
  const cards = topicId === "all"
    ? studyData.flashcards
    : studyData.flashcards.filter((card) => card.topicId === topicId);
  if (!state.query.trim()) return cards;
  const query = state.query.toLowerCase();
  return cards.filter((card) =>
    `${card.question} ${card.answer} ${card.topic}`.toLowerCase().includes(query)
  );
}

function examPromptsForTopic(topicId = "all") {
  const prompts = topicId === "all"
    ? studyData.examPrompts
    : studyData.examPrompts.filter((prompt) => prompt.topicId === topicId);
  if (!state.query.trim()) return prompts;
  const query = state.query.toLowerCase();
  return prompts.filter((prompt) =>
    `${prompt.prompt} ${prompt.source}`.toLowerCase().includes(query)
  );
}

function completionForTopic(topicId) {
  const cards = cardsForTopic(topicId);
  if (!cards.length) return 0;
  const known = cards.filter((card) => progress.cards[card.id] === "known").length;
  return Math.round((known / cards.length) * 100);
}

function setRoute(route, topicId = null) {
  state = { ...state, route, topicId, showAnswer: false };
  if (route === "quiz") state.quiz = null;
  render();
}

function deckKey(topicId) {
  const query = state.query.trim().toLowerCase();
  return `${topicId || "all"}::${query}`;
}

function ensureDeck(mode, topicId, cards) {
  const key = deckKey(topicId);
  const ids = cards.map((card) => card.id);
  progress.decks[mode] ||= {};
  const existing = progress.decks[mode][key];
  const existingOrder = Array.isArray(existing?.order) ? existing.order : [];
  const retained = existingOrder.filter((id) => ids.includes(id));
  const missing = ids.filter((id) => !retained.includes(id));
  const shouldCreate = !existing || !existingOrder.length;
  const order = shouldCreate ? shuffle(ids) : [...retained, ...shuffle(missing)];
  const index = Math.min(Math.max(Number(existing?.index || 0), 0), Math.max(order.length - 1, 0));
  const changed = !existing
    || existing.index !== index
    || existingOrder.length !== order.length
    || existingOrder.some((id, idx) => id !== order[idx]);
  if (changed) {
    progress.decks[mode][key] = { order, index };
    saveProgress();
  }
  return { key, order, index };
}

function orderedCards(cards, deck) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  return deck.order.map((id) => byId.get(id)).filter(Boolean);
}

function moveDeck(mode, key, delta) {
  const deck = progress.decks[mode][key];
  if (!deck?.order?.length) return;
  deck.index = (deck.index + delta + deck.order.length) % deck.order.length;
  saveProgress();
}

function randomizeDeck(mode, topicId, cards) {
  const key = deckKey(topicId);
  progress.decks[mode] ||= {};
  progress.decks[mode][key] = {
    order: shuffle(cards.map((card) => card.id)),
    index: 0,
  };
  saveProgress();
}

function applyHashRoute() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
  const [route, topicId] = hash.split("/");
  const topicExists = studyData.topics.some((topic) => topic.id === topicId);
  if (route === "topic" && topicExists) {
    state = { ...state, route: "topic", topicId, showAnswer: false };
  }
}

function topicHref(topicId) {
  return `${location.origin}${location.pathname}#topic/${encodeURIComponent(topicId)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function looksLikeMathLine(line) {
  const text = line.trim();
  if (!text) return false;
  // Treat only compact leading symbols as full-line equations. Longer prose
  // such as "A controller is updated at t = kTs" is handled as mixed text.
  const startsLikeEquation = /^\s*(?:[A-Z][A-Za-z0-9,]*(?:\([^)]*\)|\{[^}]+\})?(?:\/[A-Z][A-Za-z0-9,]*(?:\([^)]*\))?)?|[a-z](?:\([^)]*\))?|θ[A-Z]{2}|ω[A-Za-z0-9,]*|ζ|δ|λ|[𝑠𝑧])\s*(?:=|≈|>=|<=)/.test(text);
  if (/^(What|How|When|Why|Which|Write)\b/i.test(text)) return false;
  if (/^\(?[a-d]\)/i.test(text) && !startsLikeEquation) return false;
  if (text.split(/\s+/).length > 10 && !startsLikeEquation) return false;
  if (/^What is [A-Za-zΑ-ωµμθδλσΩε]+[A-Za-z0-9,]*\??$/.test(text)) return false;
  const equationSignals = /[=≈→{}^√Σ<>≥≤]|𝐺|𝑠|𝑧|\bG\(|\bP\(|\bZ\{|\b[CYPU]\/[RP]\b/i;
  const formulaShape = /(\([^)]+\)\s*\/\s*[^ ]+)|(\b[sz]\s*[=≈])|(\^\s*[-−]?\d+)|\b\d+\s*\/\s*\(|\b[A-Za-zΑ-ωµμ]+(?:,[A-Za-z]+)?\s*[=≈]/i;
  const compactFormula = /^(?:°C\/W|377\s*Ω|[A-Za-zΑ-ωµμ][A-Za-z0-9,]*(?:\([^)]+\))?\s*[=≈].*)\.?$/;
  return equationSignals.test(text) || formulaShape.test(text) || compactFormula.test(text);
}

function hasMathSignal(text) {
  return /[=≈<>]|>=|<=|\bapprox\b|sqrt|\^|√|π|ζ|θ|ω|lambda|Gamma|epsilon|\bTs\b|\bG\(|\bZ\{|\bY\(z\)\/R\(z\)|\bC\(z\)|\bP\(z\)|\bZ0\b|\bVF\b|\bBW\b|\bSE\b|\bA\(dB\)|\bδ\b|\bλ\b/.test(text);
}

function hasProseContext(text) {
  return /\b(a|all|ambient|an|and|are|as|because|before|between|case|compare|continuous|controller|coupling|design|device|digital|direct|discretising|every|field|for|from|heatsink|if|in|interface|into|is|junction|measured|model|of|only|or|other|output|parasitics|path|pole|poles|relevant|saturation|satisfy|signal|source|stable|subtract|the|then|to|treat|using|victim|when|where|which|with)\b/i.test(text);
}

function shouldRenderWholeFormula(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (exactFormulaToTeX(normalizeFormulaText(trimmed))) return true;
  if (hasProseContext(trimmed)) return false;
  return looksLikeMathLine(trimmed);
}

function escapeTeXText(value) {
  return String(value)
    .replace(/\\/g, "\\backslash ")
    .replace(/([#$%&_{}])/g, "\\$1");
}

function normalizeFormulaText(value) {
  return String(value)
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll(" approx ", " ≈ ")
    .replaceAll(">=", "≥")
    .replaceAll("<=", "≤")
    .replaceAll(" -> ", " → ")
    .replaceAll("*", "·")
    .replaceAll("𝐺", "G")
    .replaceAll("𝑠", "s")
    .replaceAll("𝑧", "z")
    .replaceAll("𝜁", "ζ")
    .replaceAll("𝜔", "ω");
}

function applyTeXSymbols(text) {
  return text
    .replace(/theta_JC/g, "\\theta_{JC}")
    .replace(/theta_CA/g, "\\theta_{CA}")
    .replace(/theta_JA/g, "\\theta_{JA}")
    .replace(/Delta T/g, "\\Delta T")
    .replace(/omega_BW/g, "\\omega_{BW}")
    .replace(/omega_0/g, "\\omega_0")
    .replace(/omega_b/g, "\\omega_b")
    .replace(/\bzeta\b/g, "\\zeta")
    .replace(/\bpi\b/g, "\\pi")
    .replace(/\blambda\b/g, "\\lambda")
    .replace(/\bepsilon_r\b/g, "\\epsilon_r")
    .replace(/\bGamma\b/g, "\\Gamma")
    .replace(/θJC/g, "\\theta_{JC}")
    .replace(/θCA/g, "\\theta_{CA}")
    .replace(/θJA/g, "\\theta_{JA}")
    .replace(/\bT_J,max\b/g, "T_{J,max}")
    .replace(/\bT_J\b/g, "T_J")
    .replace(/\bT_A\b/g, "T_A")
    .replace(/\bT_C\b/g, "T_C")
    .replace(/\bTJ,max\b/g, "T_{J,max}")
    .replace(/\bTJ\b/g, "T_J")
    .replace(/\bTA\b/g, "T_A")
    .replace(/\bP_D,max\b/g, "P_{D,max}")
    .replace(/\bP_D\b/g, "P_D")
    .replace(/\bP_loss\b/g, "P_{loss}")
    .replace(/\bPD,max\b/g, "P_{D,max}")
    .replace(/\bPD\b/g, "P_D")
    .replace(/\bVCE\(sat\)/g, "V_{CE(sat)}")
    .replace(/\bRDS\(on\)/g, "R_{DS(on)}")
    .replace(/\bIC\b/g, "I_C")
    .replace(/\bVin_effective\b/g, "V_{in,effective}")
    .replace(/\bVin\b/g, "V_{in}")
    .replace(/\bVout\b/g, "V_{out}")
    .replace(/\bIout\b/g, "I_{out}")
    .replace(/\bSE_dB\b/g, "SE_{dB}")
    .replace(/\bmu0\b/g, "\\mu_0")
    .replace(/\bmu_r\b/g, "\\mu_r")
    .replace(/\bdelta\b/g, "\\delta")
    .replace(/ωBW/g, "\\omega_{BW}")
    .replace(/ω0/g, "\\omega_0")
    .replace(/ωb/g, "\\omega_b")
    .replace(/ζ/g, "\\zeta")
    .replace(/ω/g, "\\omega")
    .replace(/π/g, "\\pi")
    .replace(/λ/g, "\\lambda")
    .replace(/δ/g, "\\delta")
    .replace(/[µμ]/g, "\\mu")
    .replace(/σ/g, "\\sigma")
    .replace(/τ/g, "\\tau")
    .replace(/Ω/g, "\\Omega")
    .replace(/εr/g, "\\epsilon_r")
    .replace(/Ts/g, "T_s")
    .replace(/\bZ0\b/g, "Z_0")
    .replace(/\bL0\b/g, "L_0")
    .replace(/\bC0\b/g, "C_0")
    .replace(/\bRa\b/g, "R_a")
    .replace(/\bKb\b/g, "K_b")
    .replace(/\bKt\b/g, "K_t")
    .replace(/\bKp\b/g, "K_p")
    .replace(/\bKi\b/g, "K_i")
    .replace(/\bKd\b/g, "K_d")
    .replace(/\bCPID\b/g, "C_{PID}")
    .replace(/\bfosc\b/g, "f_{osc}")
    .replace(/\bfr\b/g, "f_r")
    .replace(/\bfc\b/g, "f_c")
    .replace(/\bXL\b/g, "X_L")
    .replace(/\bXc\b/g, "X_C")
    .replace(/\bZc\b/g, "Z_C")
    .replace(/\bZin\b/g, "Z_{in}")
    .replace(/\bCtotal\b/g, "C_{total}")
    .replace(/\bRprobe\b/g, "R_{probe}")
    .replace(/\bCprobe\b/g, "C_{probe}")
    .replace(/\bCsource\b/g, "C_{source}")
    .replace(/\btr_total\b/g, "t_{r,total}")
    .replace(/\btr_actual\b/g, "t_{r,actual}")
    .replace(/\btr_measured\b/g, "t_{r,measured}")
    .replace(/\btr_instrument\b/g, "t_{r,instrument}")
    .replace(/\btr_signal\b/g, "t_{r,signal}")
    .replace(/\btr_scope\b/g, "t_{r,scope}")
    .replace(/\btr_probe\b/g, "t_{r,probe}")
    .replace(/\btr,total\b/g, "t_{r,total}")
    .replace(/\btr,actual\b/g, "t_{r,actual}")
    .replace(/\btr,measured\b/g, "t_{r,measured}")
    .replace(/\btr,instrument\b/g, "t_{r,instrument}")
    .replace(/\btr(\d+)\b/g, "t_{r$1}")
    .replace(/\btr\b/g, "t_r")
    .replace(/\bT10-90\b/g, "T_{10-90}")
    .replace(/\bVGND\b/g, "V_{GND}")
    .replace(/\bLGND\b/g, "L_{GND}")
    .replace(/\bl_edge\b/g, "l_{edge}")
    .replace(/\bomega\(s\)/g, "\\omega(s)")
    .replace(/\bdomega\b/g, "d\\omega")
    .replace(/\brho_new\b/g, "\\rho_{new}")
    .replace(/\brho_old\b/g, "\\rho_{old}")
    .replace(/\brho\b/g, "\\rho")
    .replace(/\balpha\b/g, "\\alpha")
    .replace(/\bgrad J\b/g, "\\nabla J")
    .replace(/\bsum_/g, "\\sum_")
    .replace(/\bA\(dB\)/g, "A_{dB}")
    .replace(/°C\/W/g, "{}^\\circ C/W");
}

function convertRootsToTeX(text) {
  let result = "";
  for (let idx = 0; idx < text.length; idx += 1) {
    if (text[idx] === "√" && text[idx + 1] === "(") {
      let depth = 1;
      let end = idx + 2;
      while (end < text.length && depth > 0) {
        if (text[end] === "(") depth += 1;
        if (text[end] === ")") depth -= 1;
        end += 1;
      }
      if (depth === 0) {
        result += `\\sqrt{${convertRootsToTeX(text.slice(idx + 2, end - 1))}}`;
        idx = end - 1;
        continue;
      }
    }
    if (text[idx] === "√") {
      const simple = text.slice(idx + 1).match(/^([A-Za-zΑ-ωµμ]+(?:_\{[^}]+\}|_\w)?)/);
      if (simple) {
        result += `\\sqrt{${simple[1]}}`;
        idx += simple[1].length;
        continue;
      }
    }
    result += text[idx];
  }
  return result;
}

function applyTeXFractions(text) {
  return text
    .replace(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g, "\\frac{$1}{$2}")
    .replace(/([A-Za-z]+\([^()]+\))\s*\/\s*([A-Za-z]+\([^()]+\))/g, "\\frac{$1}{$2}")
    .replace(/([A-Za-z]+\([^()]+\))\s*\/\s*([A-Za-z]|\{?\\[A-Za-z]+(?:_\{[^}]+\}|_\w)?)/g, "\\frac{$1}{$2}")
    .replace(/([0-9.]+|[A-Za-z]+|\{?\\[A-Za-z]+(?:_\{[^}]+\}|_\w)?)\s*\/\s*(\\sqrt\{[^}]+\}|[A-Za-z]+_\{[^}]+\}|[A-Za-z]+_\w|\([^()]+\)|[A-Za-z]|\\[A-Za-z]+)/g, "\\frac{$1}{$2}")
    .replace(/\(([^()]+)\)\s*\/\s*([A-Za-z]+_\{[^}]+\}|[A-Za-z]+_\w|\\[A-Za-z]+(?:_\{[^}]+\}|_\w)?|[A-Za-z]+)/g, "\\frac{$1}{$2}")
    .replace(/([A-Za-z]+_\{[^}]+\}|[A-Za-z]+_\w|[A-Za-z]+|\\[A-Za-z]+)\s*\/\s*\(([^()]+)\)/g, "\\frac{$1}{$2}");
}

function formulaToTeX(value) {
  let text = normalizeFormulaText(value);
  const exact = exactFormulaToTeX(text);
  if (exact) return exact;
  text = applyTeXSymbols(text);
  text = convertRootsToTeX(text);
  while (/sqrt\([^()]+\)/.test(text)) {
    text = text.replace(/sqrt\(([^()]+)\)/g, "\\sqrt{$1}");
  }
  text = text
    .replace(/e\^\(([^()]+)\)/g, "e^{$1}")
    .replace(/([A-Za-z])\^([-+]?\w+)/g, "$1^{$2}")
    .replace(/([\\A-Za-z]+(?:_\{[^}]+\}|_\w)?)²/g, "$1^2")
    .replace(/([\\A-Za-z]+(?:_\{[^}]+\}|_\w)?)⁴/g, "$1^4")
    .replace(/ln²/g, "\\ln^2")
    .replace(/\bln\(/g, "\\ln(")
    .replace(/Σ/g, "\\sum")
    .replace(/≈/g, "\\approx")
    .replace(/→/g, "\\to")
    .replace(/≥/g, "\\ge")
    .replace(/≤/g, "\\le")
    .replace(/>/g, "\\gt")
    .replace(/</g, "\\lt")
    .replace(/·/g, "\\,")
    .replace(/\bBW\b/g, "\\mathrm{BW}")
    .replace(/\bVF\b/g, "\\mathrm{VF}")
    .replace(/\bSE\b/g, "\\mathrm{SE}")
    .replace(/\bOS\b/g, "\\mathrm{OS}")
    .replace(/\bST\b/g, "\\mathrm{ST}")
    .replace(/\bCP\b/g, "CP");
  text = applyTeXFractions(text);
  return text;
}

function exactFormulaToTeX(text) {
  const key = text.trim().replace(/\.$/, "");
  const formulas = {
    "s ≈ (z - 1)/Ts": "s \\approx \\frac{z - 1}{T_s}",
    "s ≈ (z - 1)/(zTs)": "s \\approx \\frac{z - 1}{zT_s}",
    "s ≈ (2/Ts)((z - 1)/(z + 1))": "s \\approx \\frac{2}{T_s}\\frac{z - 1}{z + 1}",
    "P(z) = ((z - 1)/z) Z{G(s)/s}": "P(z)=\\frac{z-1}{z}\\,Z\\left\\{\\frac{G(s)}{s}\\right\\}",
    "((z - 1)/z) Z{G(s)/s}": "\\frac{z-1}{z}\\,Z\\left\\{\\frac{G(s)}{s}\\right\\}",
    "G(s)/s": "\\frac{G(s)}{s}",
    "z = e^(-aTs)": "z=e^{-aT_s}",
    "z = e^(-a Ts)": "z=e^{-aT_s}",
    "s = -a": "s=-a",
    "s = +a": "s=+a",
    "z = e^(a Ts)": "z=e^{aT_s}",
    "|z| < 1": "|z|<1",
    "|z_i| < 1": "|z_i|<1",
    "z = e^(aTs), which is outside the unit circle for positive Ts": "z=e^{aT_s}\\quad\\text{outside the unit circle for }T_s>0",
    "Z{1/s} = z/(z - 1)": "Z\\left\\{\\frac{1}{s}\\right\\}=\\frac{z}{z-1}",
    "Z{1/(s+a)} = z/(z - e^(-aTs))": "Z\\left\\{\\frac{1}{s+a}\\right\\}=\\frac{z}{z-e^{-aT_s}}",
    "Ts = 2π/(Nωb)": "T_s=\\frac{2\\pi}{N\\omega_b}",
    "Ts = 2 pi / (N omega_b)": "T_s=\\frac{2\\pi}{N\\omega_b}",
    "N approx 30": "N\\approx 30",
    "N approx 10": "N\\approx 10",
    "ωBW = ω0√(1 - 2ζ² + √(4ζ⁴ - 4ζ² + 2))": "\\omega_{BW}=\\omega_0\\sqrt{1-2\\zeta^2+\\sqrt{4\\zeta^4-4\\zeta^2+2}}",
    "omega_BW = omega_0 sqrt(1 - 2 zeta^2 + sqrt(4 zeta^4 - 4 zeta^2 + 2))": "\\omega_{BW}=\\omega_0\\sqrt{1-2\\zeta^2+\\sqrt{4\\zeta^4-4\\zeta^2+2}}",
    "ζ = -ln(OS)/√(π² + ln²(OS)), where OS is decimal": "\\zeta=-\\frac{\\ln(\\mathrm{OS})}{\\sqrt{\\pi^2+\\ln^2(\\mathrm{OS})}}\\quad\\text{where OS is decimal}",
    "zeta = -ln(OS) / sqrt(pi^2 + ln(OS)^2), where OS is decimal": "\\zeta=-\\frac{\\ln(\\mathrm{OS})}{\\sqrt{\\pi^2+\\ln^2(\\mathrm{OS})}}\\quad\\text{where OS is decimal}",
    "OS = 0.10, not 10": "\\mathrm{OS}=0.10\\text{, not }10",
    "ST ≈ 4/(ζω0)": "ST\\approx\\frac{4}{\\zeta\\omega_0}",
    "ST approx 4 / (zeta omega_0)": "ST\\approx\\frac{4}{\\zeta\\omega_0}",
    "CPID(s) = Kp + Ki/s + Kd s": "C_{PID}(s)=K_p+\\frac{K_i}{s}+K_d s",
    "Continuous PID: C_PID(s) = Kp + Ki/s + Kd s": "\\text{Continuous PID: }C_{PID}(s)=K_p+\\frac{K_i}{s}+K_d s",
    "Reflection coefficient: Gamma = (ZL - Z0) / (ZL + Z0)": "\\text{Reflection coefficient: }\\Gamma=\\frac{Z_L-Z_0}{Z_L+Z_0}",
    "Finite-sample settling: ideally Y(z)/R(z) = 1/z^m": "\\text{Finite-sample settling: ideally }\\frac{Y(z)}{R(z)}=\\frac{1}{z^m}",
    "C(z) = (1/P(z)) · 1/(z^m - 1)": "C(z)=\\frac{1}{P(z)}\\frac{1}{z^m-1}",
    "Y/R = CP/(1 + CP)": "\\frac{Y}{R}=\\frac{CP}{1+CP}",
    "Y(z)/R(z) = C(z)P(z) / (1 + C(z)P(z))": "\\frac{Y(z)}{R(z)}=\\frac{C(z)P(z)}{1+C(z)P(z)}",
    "Y(z)/R(z) = 1 / z^m": "\\frac{Y(z)}{R(z)}=\\frac{1}{z^m}",
    "C(z) = (1 / P(z)) * (1 / (z^m - 1))": "C(z)=\\frac{1}{P(z)}\\frac{1}{z^m-1}",
    "Ra = V/I, because ω = 0": "R_a=\\frac{V}{I}\\quad\\text{because }\\omega=0",
    "Winding resistance Ra = V/I, because ω = 0": "\\text{Winding resistance }R_a=\\frac{V}{I}\\quad\\text{because }\\omega=0",
    "Kb = (V - RaI)/ω at steady state": "K_b=\\frac{V-R_a I}{\\omega}\\quad\\text{at steady state}",
    "B = τ/ω = KtI/ω": "B=\\frac{\\tau}{\\omega}=\\frac{K_t I}{\\omega}",
    "J(ρ) = (1/(2N)) Σ e(ρ,k)²": "J(\\rho)=\\frac{1}{2N}\\sum e(\\rho,k)^2",
    "e(ρ,k) = y(ρ,k) - r(k), the negative of the usual r-y convention": "e(\\rho,k)=y(\\rho,k)-r(k)\\quad\\text{negative of the usual }r-y\\text{ convention}",
    "°C/W": "{}^\\circ C/W",
    "θJA = θJC + θCA": "\\theta_{JA}=\\theta_{JC}+\\theta_{CA}",
    "TJ = TA + θJA PD": "T_J=T_A+\\theta_{JA}P_D",
    "PD,max = (TJ,max - TA)/θJA": "P_{D,max}=\\frac{T_{J,max}-T_A}{\\theta_{JA}}",
    "VGND ≈ LGND · dI/dt": "V_{GND}\\approx L_{GND}\\frac{dI}{dt}",
    "Z0 = √(L0/C0)": "Z_0=\\sqrt{\\frac{L_0}{C_0}}",
    "Z0 = sqrt(L0 / C0)": "Z_0=\\sqrt{\\frac{L_0}{C_0}}",
    "l >= l_edge / 10": "l\\ge\\frac{l_{edge}}{10}",
    "lambda / 8": "\\frac{\\lambda}{8}",
    "BW = 0.35/tr": "BW=\\frac{0.35}{t_r}",
    "BW = 2.2 fosc": "BW=2.2f_{osc}",
    "T10-90 = 2.2RC": "T_{10-90}=2.2RC",
    "tr,total = √(tr1² + tr2² + ...)": "t_{r,total}=\\sqrt{t_{r1}^2+t_{r2}^2+\\cdots}",
    "tr,actual = √(tr,measured² - tr,instrument²)": "t_{r,actual}=\\sqrt{t_{r,measured}^2-t_{r,instrument}^2}",
    "fr = 1/(2π√(LC))": "f_r=\\frac{1}{2\\pi\\sqrt{LC}}",
    "VF = v/c = 1/√εr": "VF=\\frac{v}{c}=\\frac{1}{\\sqrt{\\epsilon_r}}",
    "VF = v / c = 1 / sqrt(epsilon_r)": "VF=\\frac{v}{c}=\\frac{1}{\\sqrt{\\epsilon_r}}",
    "λ = c/f": "\\lambda=\\frac{c}{f}",
    "ZW = E/H": "Z_W=\\frac{E}{H}",
    "377 Ω": "377\\,\\Omega",
    "Far field when d > λ/(2π)": "\\text{Far field when }d>\\frac{\\lambda}{2\\pi}",
    "d > lambda / (2 pi)": "d>\\frac{\\lambda}{2\\pi}",
    "Zin approx Rprobe parallel (1 / (j omega Cprobe))": "Z_{in}\\approx R_{probe}\\parallel\\frac{1}{j\\omega C_{probe}}",
    "Ctotal = Csource + Cprobe + other parasitics": "C_{total}=C_{source}+C_{probe}+\\text{other parasitics}",
    "SE_dB = 20 log10(E_without / E_with)": "SE_{dB}=20\\log_{10}\\left(\\frac{E_{without}}{E_{with}}\\right)",
    "SE_dB = 20 log10(H_without / H_with)": "SE_{dB}=20\\log_{10}\\left(\\frac{H_{without}}{H_{with}}\\right)",
    "δ = 1/√(π f μ σ)": "\\delta=\\frac{1}{\\sqrt{\\pi f\\mu\\sigma}}",
    "20 log10(n)": "20\\log_{10}(n)",
    "A(dB) = 8.7(t/δ)": "A_{dB}=8.7\\frac{t}{\\delta}",
    "SE ≈ R + A, reflection plus absorption loss": "SE\\approx R+A\\quad\\text{reflection plus absorption loss}",
    "P approx VCE(sat) * IC": "P\\approx V_{CE(sat)}I_C",
    "P approx I^2 RDS(on)": "P\\approx I^2R_{DS(on)}",
  };
  return formulas[key] || null;
}

function renderInlineFormula(text) {
  return `<span class="math-inline">\\(${formulaToTeX(text)}\\)</span>`;
}

function formatMixedText(value) {
  const text = String(value);
  const inlinePatterns = [
    /\bkTs\s*<=\s*t\s*<\s*\(k\+1\)Ts\b/g,
    /\bt\s*=\s*kTs\b/g,
    /\bN\s+approx\s+\d+\b/gi,
    /\|z_i?\|\s*<\s*1/g,
    /\bs\s*=\s*[-+]a\b/g,
    /\bz\s*=\s*e\^\([^)]+\)/g,
    /\bl\s*>=\s*l_edge\s*\/\s*10\b/g,
    /\bd\s*>\s*lambda\s*\/\s*\(2\s*pi\)/g,
    /\blambda\s*\/\s*8\b/g,
    /\b20\s+log10\(n\)/g,
    /\bP\s+approx\s+VCE\(sat\)\s*\*?\s*IC\b/g,
    /\bP\s+approx\s+I\^2\s+RDS\(on\)/g,
    /\bG\(s\)\/s\b/g,
    /\b1\/\([^()]+\)/g,
    /\bG\(s\)|\bG\(z\)|\bP\(z\)|\bC\(z\)|\bu\(t\)|\bu\[k\]|\by\[k\]|\bY\(z\)\/R\(z\)/g,
    /theta_JC|theta_CA|theta_JA|θJC|θCA|θJA|\bT_J,max\b|\bT_J\b|\bT_A\b|\bT_C\b|\bTJ,max\b|\bTJ\b|\bTA\b|\bPD,max\b|\bPD\b|\bP_D,max\b|\bP_D\b|\bVGND\b|\bLGND\b|\bTs\b|\bomega_BW\b|\bomega_0\b|\bzeta\b|\bomega\b|\blambda\b/g,
  ];
  const spans = [];
  for (const pattern of inlinePatterns) {
    for (const match of text.matchAll(pattern)) {
      spans.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const selected = [];
  let coveredUntil = -1;
  for (const span of spans) {
    if (span.start >= coveredUntil) {
      selected.push(span);
      coveredUntil = span.end;
    }
  }
  if (!selected.length) return escapeHtml(text);
  let html = "";
  let cursor = 0;
  for (const span of selected) {
    html += escapeHtml(text.slice(cursor, span.start));
    html += renderInlineFormula(span.text);
    cursor = span.end;
  }
  return html + escapeHtml(text.slice(cursor));
}

function formatStudyText(value) {
  return String(value)
    .split(/\r?\n/)
    .map((line) => {
      const labelledFormula = splitLabelledFormula(line);
      if (labelledFormula) return labelledFormula;
      if (shouldRenderWholeFormula(line)) return renderInlineFormula(line);
      return formatMixedText(line);
    })
    .join("<br>");
}

function splitLabelledFormula(line) {
  const idx = line.indexOf(":");
  if (idx < 0) return null;
  const label = line.slice(0, idx + 1);
  const formula = line.slice(idx + 1).trim();
  if (!formula || !hasMathSignal(formula)) return null;
  if (shouldRenderWholeFormula(formula)) return `${escapeHtml(label)} ${renderInlineFormula(formula)}`;
  return `${escapeHtml(label)} ${formatMixedText(formula)}`;
}

function renderShell(content) {
  app.innerHTML = `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">705</div>
        <div>
          <h1>Study Console</h1>
          <p>${studyData.metadata.counts.flashcards} cards - ${studyData.metadata.counts.examPrompts} exam prompts</p>
        </div>
      </div>
      <div class="nav-group">
        <p class="nav-title">Modes</p>
        ${navButton("dashboard", "Dashboard")}
        ${navButton("flashcards", "Flashcards")}
        ${navButton("quiz", "Quiz")}
        ${navButton("exam", "Exam Practice")}
      </div>
      <div class="nav-group">
        <p class="nav-title">Topic Summaries</p>
        ${studyData.topics.map((topic) => `
          <button class="topic-link ${state.route === "topic" && state.topicId === topic.id ? "active" : ""}"
            data-route="topic" data-topic="${topic.id}">
            <span>${escapeHtml(topic.title)}</span>
            <span class="count-pill">${cardsForTopic(topic.id).length}</span>
          </button>
        `).join("")}
      </div>
    </aside>
    <main class="main">
      <div class="topbar">
        <label class="search">
          <span aria-hidden="true">Search</span>
          <input id="searchBox" value="${escapeHtml(state.query)}" placeholder="Search cards, answers, or exam prompts" />
        </label>
        <div class="top-actions">
          <button class="btn secondary" data-action="reset-progress">Reset Progress</button>
        </div>
      </div>
      <div class="content">${content}</div>
    </main>
  `;

  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      setRoute(button.dataset.route, button.dataset.topic || null);
    });
  });
  byId("searchBox").addEventListener("input", (event) => {
    const cursor = event.target.selectionStart;
    state.query = event.target.value;
    render();
    const searchBox = byId("searchBox");
    searchBox.focus();
    searchBox.setSelectionRange(cursor, cursor);
  });
  document.querySelector("[data-action='reset-progress']").addEventListener("click", () => {
    progress = normalizeProgress(null);
    saveProgress();
    render();
  });
}

function navButton(route, label) {
  return `
    <button class="nav-button ${state.route === route ? "active" : ""}" data-route="${route}">
      <span>${label}</span>
      ${route === "quiz" ? `<span class="count-pill">${progress.quizCorrect}/${progress.quizAttempts}</span>` : ""}
    </button>
  `;
}

function renderDashboard() {
  const knownCards = Object.values(progress.cards).filter((value) => value === "known").length;
  const hardCards = Object.values(progress.cards).filter((value) => value === "hard").length;
  const highPriority = studyData.flashcards.filter((card) => card.priority === "High").length;
  const topicCards = studyData.topics.map((topic) => {
    const count = studyData.flashcards.filter((card) => card.topicId === topic.id).length;
    return `
      <a class="card topic-card" href="${topicHref(topic.id)}" target="_blank" rel="noopener">
        <div class="topic-meta">
          <span class="tag topic">${escapeHtml(topic.area)}</span>
          <span class="tag">${count} cards</span>
          <span class="tag">${completionForTopic(topic.id)}%</span>
        </div>
        <h3>${escapeHtml(topic.title)}</h3>
        <p>${escapeHtml(topic.whyItMatters)}</p>
      </a>
    `;
  }).join("");

  renderShell(`
    <h1 class="section-heading">MECHENG 705 revision workspace</h1>
    <p class="lede">Use summary pages as linked hints, then move into flashcards, multiple-choice recall, and past-paper planning prompts.</p>
    <div class="grid cols-3 panel">
      <div class="card metric"><strong>${studyData.flashcards.length}</strong><span>Flashcards from the supplied workbook</span></div>
      <div class="card metric"><strong>${knownCards}</strong><span>Marked known</span></div>
      <div class="card metric"><strong>${highPriority}</strong><span>High-priority cards</span></div>
    </div>
    <div class="grid cols-2 panel">
      <div class="card side-panel">
        <h3>Current weak spots</h3>
        ${hardCards ? renderMistakeList() : `<p class="lede">No hard cards marked yet.</p>`}
      </div>
      <div class="card side-panel">
        <h3>Topic progress</h3>
        ${studyData.topics.map((topic) => `
          <div class="progress-row">
            <span>${escapeHtml(topic.title)}</span>
            <div class="bar"><span style="width:${completionForTopic(topic.id)}%"></span></div>
            <strong>${completionForTopic(topic.id)}%</strong>
          </div>
        `).join("")}
      </div>
    </div>
    <div class="card side-panel panel">
      <h3>Source coverage</h3>
      <p class="lede">Built from the supplied lecture slides, practice questions, past exams, and rote memorisation workbook. Initial assignment document: ${escapeHtml(studyData.metadata.initialAssignmentDocument.status.replaceAll("_", " "))}.</p>
    </div>
    <div class="grid cols-3 panel">${topicCards}</div>
  `);
}

function renderMistakeList() {
  const hard = studyData.flashcards
    .filter((card) => progress.cards[card.id] === "hard")
    .slice(0, 8);
  return `
    <ul class="list">
      ${hard.map((card) => `
        <li><a class="hint-link" href="${topicHref(card.topicId)}" target="_blank" rel="noopener">${escapeHtml(card.topic)}</a>: ${formatStudyText(card.question)}</li>
      `).join("")}
    </ul>
  `;
}

function renderFlashcards() {
  const topicId = state.topicId || "all";
  const cards = cardsForTopic(topicId);
  const deck = ensureDeck("flashcards", topicId, cards);
  const deckCards = orderedCards(cards, deck);
  const card = deckCards[deck.index % Math.max(deckCards.length, 1)];
  const topicOptions = topicSelect("flashcards", topicId);

  if (!cards.length) {
    renderShell(`
      <h1 class="section-heading">Flashcards</h1>
      <div class="toolbar">${topicOptions}</div>
      <div class="card empty">No cards match the current filter.</div>
    `);
    return;
  }

  renderShell(`
    <h1 class="section-heading">Flashcards</h1>
    <p class="lede">Each card links to its topic summary, so use the hint when you know the area but not the exact answer.</p>
    <div class="toolbar">
      ${topicOptions}
      <button class="btn secondary" data-action="randomize-flashcards">Randomize Order</button>
    </div>
    <div class="study-layout panel">
      <section class="card flashcard">
        <div>
        <p class="prompt-label">${escapeHtml(card.topic)} - ${escapeHtml(card.priority)} priority - ${deck.index + 1} of ${deckCards.length}</p>
          <p class="question-text">${formatStudyText(card.question)}</p>
          ${state.showAnswer ? `<div class="answer-box">${formatStudyText(card.answer)}</div>` : ""}
        </div>
        <div class="card-footer">
          <a class="hint-link" href="${topicHref(card.topicId)}" target="_blank" rel="noopener">Open ${escapeHtml(card.topic)} summary</a>
          <div class="flashcard-actions">
            <div class="toolbar">
              <button class="btn secondary" data-action="previous-card">Previous</button>
              <button class="btn" data-action="toggle-answer">${state.showAnswer ? "Hide Answer" : "Show Answer"}</button>
              <button class="btn secondary" data-action="next-card">Next</button>
            </div>
            ${state.showAnswer ? `
              <div class="toolbar recall-toolbar" aria-label="Mark recall">
                <button class="btn secondary" data-mark="hard">Needs work</button>
                <button class="btn" data-mark="known">Known</button>
              </div>
            ` : ""}
          </div>
        </div>
      </section>
    </div>
  `);

  bindDeckControls(deck, cards, card, topicId);
}

function topicSelect(route, topicId) {
  return `
    <select class="select" id="topicSelect">
      <option value="all" ${topicId === "all" ? "selected" : ""}>All topics</option>
      ${studyData.topics.map((topic) => `
        <option value="${topic.id}" ${topicId === topic.id ? "selected" : ""}>${escapeHtml(topic.title)}</option>
      `).join("")}
    </select>
  `;
}

function bindTopicSelect(route) {
  const select = byId("topicSelect");
  if (!select) return;
  select.addEventListener("change", (event) => {
    const topicId = event.target.value === "all" ? null : event.target.value;
    setRoute(route, topicId);
  });
}

function bindDeckControls(deck, cards, card, topicId) {
  bindTopicSelect("flashcards");
  document.querySelector("[data-action='previous-card']").addEventListener("click", () => {
    moveDeck("flashcards", deck.key, -1);
    state.showAnswer = false;
    render();
  });
  document.querySelector("[data-action='next-card']").addEventListener("click", () => {
    moveDeck("flashcards", deck.key, 1);
    state.showAnswer = false;
    render();
  });
  document.querySelector("[data-action='randomize-flashcards']").addEventListener("click", () => {
    randomizeDeck("flashcards", topicId, cards);
    state.showAnswer = false;
    render();
  });
  document.querySelector("[data-action='toggle-answer']").addEventListener("click", () => {
    state.showAnswer = !state.showAnswer;
    render();
  });
  document.querySelectorAll("[data-mark]").forEach((button) => {
    button.addEventListener("click", () => {
      progress.cards[card.id] = button.dataset.mark;
      saveProgress();
      moveDeck("flashcards", deck.key, 1);
      state.showAnswer = false;
      render();
    });
  });
}

function buildQuiz(card, topicId) {
  const kind = answerKind(card);
  const seenAnswers = new Set([normalizeAnswer(card.answer)]);
  // Distractors are intentionally limited to the same topic. The past exams mix
  // methods inside a topic, but they do not ask a control question with a
  // thermal-resistance answer, so cross-topic fallback made the quiz too easy.
  const distractors = shuffle(studyData.flashcards)
    .filter((item) => item.topicId === card.topicId && item.id !== card.id && item.answer)
    .map((item) => ({ item, score: distractorScore(card, item, kind) }))
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item.answer)
    .filter((answer) => {
      const key = normalizeAnswer(answer);
      if (!key || seenAnswers.has(key)) return false;
      seenAnswers.add(key);
      return true;
    })
    .slice(0, 3);
  return {
    topicId,
    card,
    options: shuffle([card.answer, ...distractors]),
    selected: null,
  };
}

function normalizeAnswer(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function answerKind(card) {
  const text = `${card.question} ${card.answer}`;
  if (/[=≈<>]|>=|<=|\bapprox\b|sqrt|√|\^|π|ζ|θ|ω|lambda|Gamma|\bZ\{|\b[A-Z]\([^)]*\)\s*\//.test(text)) {
    return "formula";
  }
  if (/\b(why|explain|advantage|disadvantage|minimis|suitable|safe|compare|limitation)\b/i.test(card.question)) {
    return "reasoning";
  }
  if (/\b(what is|define|what does|what are)\b/i.test(card.question)) {
    return "definition";
  }
  return "concept";
}

function distractorScore(card, candidate, kind) {
  let score = 0;
  if (answerKind(candidate) === kind) score += 40;
  if (candidate.priority === card.priority) score += 8;
  const cardStem = card.question.split(/\s+/).slice(0, 3).join(" ").toLowerCase();
  const candidateStem = candidate.question.split(/\s+/).slice(0, 3).join(" ").toLowerCase();
  if (cardStem === candidateStem) score += 10;
  const lengthDifference = Math.abs(candidate.answer.length - card.answer.length);
  score += Math.max(0, 18 - Math.floor(lengthDifference / 8));
  return score;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function renderQuiz() {
  const topicId = state.topicId || "all";
  const cards = cardsForTopic(topicId).filter((card) => card.answer.length > 0);
  const deck = ensureDeck("quiz", topicId, cards);
  const deckCards = orderedCards(cards, deck);
  const card = deckCards[deck.index % Math.max(deckCards.length, 1)];
  if (!cards.length) {
    renderShell(`
      <h1 class="section-heading">Quiz</h1>
      <div class="toolbar">${topicSelect("quiz", topicId)}</div>
      <div class="card empty">No quiz questions match the current filter.</div>
    `);
    bindTopicSelect("quiz");
    return;
  }
  if (!state.quiz || state.quiz.card.id !== card.id || state.quiz.topicId !== topicId) {
    state.quiz = buildQuiz(card, topicId);
  }
  const quiz = state.quiz;
  renderShell(`
    <h1 class="section-heading">Quiz</h1>
    <p class="lede">Pick the best answer. Use the summary link as a hint when you need the concept rather than the answer.</p>
    <div class="toolbar">
      ${topicSelect("quiz", topicId)}
      <button class="btn secondary" data-action="randomize-quiz">Randomize Order</button>
    </div>
    <section class="card flashcard panel">
      <div>
        <p class="prompt-label">${escapeHtml(quiz.card.topic)} - ${escapeHtml(quiz.card.priority)} priority - ${deck.index + 1} of ${deckCards.length}</p>
        <p class="question-text">${formatStudyText(quiz.card.question)}</p>
        <div class="quiz-options">
          ${quiz.options.map((option) => renderOption(option, quiz)).join("")}
        </div>
      </div>
      <div class="card-footer">
        <a class="hint-link" href="${topicHref(quiz.card.topicId)}" target="_blank" rel="noopener">Open ${escapeHtml(quiz.card.topic)} summary</a>
        <button class="btn" data-action="new-quiz">Next Question</button>
      </div>
    </section>
  `);

  bindTopicSelect("quiz");
  document.querySelectorAll("[data-option]").forEach((button) => {
    button.addEventListener("click", () => answerQuiz(button.dataset.option));
  });
  document.querySelector("[data-action='new-quiz']").addEventListener("click", () => {
    moveDeck("quiz", deck.key, 1);
    state.quiz = null;
    render();
  });
  document.querySelector("[data-action='randomize-quiz']").addEventListener("click", () => {
    randomizeDeck("quiz", topicId, cards);
    state.quiz = null;
    render();
  });
}

function renderOption(option, quiz) {
  let className = "option";
  if (quiz.selected) {
    if (option === quiz.card.answer) className += " correct";
    if (option === quiz.selected && option !== quiz.card.answer) className += " wrong";
  }
  return `<button class="${className}" data-option="${escapeHtml(option)}">${formatStudyText(option)}</button>`;
}

function answerQuiz(answer) {
  if (state.quiz.selected) return;
  const isCorrect = answer === state.quiz.card.answer;
  state.quiz.selected = answer;
  progress.quizAttempts += 1;
  if (isCorrect) {
    progress.quizCorrect += 1;
    progress.cards[state.quiz.card.id] = "known";
  } else {
    progress.cards[state.quiz.card.id] = "hard";
    progress.mistakes = [state.quiz.card.id, ...progress.mistakes.filter((id) => id !== state.quiz.card.id)].slice(0, 20);
  }
  saveProgress();
  render();
}

function renderTopic() {
  const topic = topicById(state.topicId || "control");
  const cards = cardsForTopic(topic.id);
  const exams = examPromptsForTopic(topic.id).slice(0, 4);
  renderShell(`
    <h1 class="section-heading">${escapeHtml(topic.title)}</h1>
    <p class="lede">${escapeHtml(topic.whyItMatters)}</p>
    <div class="summary-grid panel">
      <section class="grid">
        ${summaryBlock("Key Ideas", topic.keyIdeas)}
        ${summaryBlock("Formula / Rule Triggers", topic.formulas)}
        ${summaryBlock("Exam Moves", topic.examMoves)}
        <div class="card side-panel summary-block">
          <h2>Linked Practice</h2>
          ${exams.length ? exams.map((exam) => `
            <article class="exam-card">
              <span class="tag">${escapeHtml(exam.source)} p.${exam.page}</span>
              <p>${formatStudyText(exam.prompt)}</p>
            </article>
          `).join("") : `<p class="lede">No extracted past-paper prompt matched this topic yet.</p>`}
        </div>
      </section>
      <aside class="grid">
        <div class="card visual-panel">${diagram(topic.visual)}</div>
        <div class="card side-panel">
          <h3>Sources</h3>
          <div class="source-list">
            ${topic.sources.map((source) => `<span class="tag">${escapeHtml(source)}</span>`).join("")}
          </div>
        </div>
        <div class="card side-panel">
          <h3>Cards in this topic</h3>
          <p class="lede">${cards.length} cards - ${completionForTopic(topic.id)}% marked known</p>
          <div class="toolbar">
            <button class="btn" data-route="flashcards" data-topic="${topic.id}">Study Cards</button>
            <button class="btn secondary" data-route="quiz" data-topic="${topic.id}">Quiz Topic</button>
          </div>
        </div>
      </aside>
    </div>
  `);
}

function summaryBlock(title, items) {
  return `
    <div class="card side-panel summary-block">
      <h2>${title}</h2>
      <ul class="list">${items.map((item) => `<li>${formatStudyText(item)}</li>`).join("")}</ul>
    </div>
  `;
}

function renderExamPractice() {
  const topicId = state.topicId || "all";
  const prompts = examPromptsForTopic(topicId);
  renderShell(`
    <h1 class="section-heading">Exam practice</h1>
    <p class="lede">Use these as planning drills: identify the topic, choose the method, and write the first three lines you would put in an exam answer.</p>
    <div class="toolbar">${topicSelect("exam", topicId)}</div>
    <div class="grid cols-2 panel">
      ${prompts.map((prompt) => {
        const topic = topicById(prompt.topicId);
        return `
          <article class="card exam-card">
            <div class="topic-meta">
              <span class="tag topic">${escapeHtml(topic.title)}</span>
              <span class="tag">${escapeHtml(prompt.source)} p.${prompt.page}</span>
            </div>
            <p>${formatStudyText(prompt.prompt)}</p>
            <a class="hint-link" href="${topicHref(topic.id)}" target="_blank" rel="noopener">Open hint page</a>
          </article>
        `;
      }).join("") || `<div class="card empty">No exam prompts match the current filter.</div>`}
    </div>
  `);
  bindTopicSelect("exam");
}

function diagram(kind) {
  // Small inline SVGs act as visual anchors for the summary pages.
  const commonArrow = `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#4f565f"/></marker></defs>`;
  const diagrams = {
    "control-loop": `
      <svg class="diagram" viewBox="0 0 320 210" role="img" aria-label="digital control loop">
        ${commonArrow}
        <rect class="node accent" x="18" y="80" width="76" height="44" rx="7"/><text x="36" y="106">Reference</text>
        <rect class="node" x="124" y="80" width="78" height="44" rx="7"/><text x="142" y="106">Digital C</text>
        <rect class="node warn" x="232" y="80" width="74" height="44" rx="7"/><text x="252" y="106">Plant</text>
        <path d="M94 102 H124" stroke="#4f565f" stroke-width="2" marker-end="url(#arrow)"/>
        <path d="M202 102 H232" stroke="#4f565f" stroke-width="2" marker-end="url(#arrow)"/>
        <path d="M270 124 V166 H58 V124" fill="none" stroke="#4f565f" stroke-width="2" marker-end="url(#arrow)"/>
      </svg>`,
    "emi-chain": `
      <svg class="diagram" viewBox="0 0 320 210" role="img" aria-label="EMI source path victim chain">
        ${commonArrow}
        <rect class="node warn" x="18" y="80" width="76" height="44" rx="7"/><text x="38" y="106">Source</text>
        <rect class="node" x="124" y="80" width="78" height="44" rx="7"/><text x="145" y="106">Path</text>
        <rect class="node accent" x="232" y="80" width="74" height="44" rx="7"/><text x="252" y="106">Victim</text>
        <path d="M94 102 H124" stroke="#4f565f" stroke-width="2" marker-end="url(#arrow)"/>
        <path d="M202 102 H232" stroke="#4f565f" stroke-width="2" marker-end="url(#arrow)"/>
      </svg>`,
    thermal: `
      <svg class="diagram" viewBox="0 0 320 210" role="img" aria-label="thermal resistance chain">
        ${commonArrow}
        <rect class="node warn" x="16" y="86" width="70" height="40" rx="7"/><text x="30" y="110">Junction</text>
        <rect class="node" x="116" y="86" width="70" height="40" rx="7"/><text x="136" y="110">Case</text>
        <rect class="node accent" x="216" y="86" width="88" height="40" rx="7"/><text x="232" y="110">Ambient</text>
        <path d="M86 106 H116" stroke="#4f565f" stroke-width="2" marker-end="url(#arrow)"/>
        <path d="M186 106 H216" stroke="#4f565f" stroke-width="2" marker-end="url(#arrow)"/>
        <text x="98" y="82">Rth</text><text x="198" y="82">Rth</text>
      </svg>`,
    trace: `
      <svg class="diagram" viewBox="0 0 320 210" role="img" aria-label="signal trace and return path">
        ${commonArrow}
        <path d="M32 82 H288" stroke="#0f766e" stroke-width="8" stroke-linecap="round"/>
        <path d="M32 138 H288" stroke="#b45309" stroke-width="8" stroke-linecap="round"/>
        <path d="M64 82 C84 42, 112 42, 132 82 S180 122, 202 82 S248 42, 270 82" fill="none" stroke="#4f46e5" stroke-width="2.2"/>
        <text x="24" y="62">Fast edge</text><text x="24" y="166">Return path</text>
      </svg>`,
    probe: `
      <svg class="diagram" viewBox="0 0 320 210" role="img" aria-label="probe loading loop">
        ${commonArrow}
        <rect class="node accent" x="36" y="70" width="96" height="46" rx="7"/><text x="58" y="98">Circuit</text>
        <path d="M132 92 H214" stroke="#4f565f" stroke-width="2" marker-end="url(#arrow)"/>
        <circle cx="238" cy="92" r="28" class="node warn"/><text x="220" y="98">Probe</text>
        <path d="M238 120 C220 160, 122 160, 86 116" fill="none" stroke="#89919b" stroke-width="2"/>
        <text x="118" y="178">ground loop</text>
      </svg>`,
    "model-id": `
      <svg class="diagram" viewBox="0 0 320 210" role="img" aria-label="model identification workflow">
        ${commonArrow}
        <rect class="node accent" x="18" y="76" width="74" height="44" rx="7"/><text x="42" y="102">Data</text>
        <rect class="node" x="122" y="76" width="82" height="44" rx="7"/><text x="138" y="102">Estimate</text>
        <rect class="node warn" x="234" y="76" width="78" height="44" rx="7"/><text x="250" y="102">Validate</text>
        <path d="M92 98 H122" stroke="#4f565f" stroke-width="2" marker-end="url(#arrow)"/>
        <path d="M204 98 H234" stroke="#4f565f" stroke-width="2" marker-end="url(#arrow)"/>
      </svg>`,
    ift: `
      <svg class="diagram" viewBox="0 0 320 210" role="img" aria-label="iterative feedback tuning loop">
        ${commonArrow}
        <rect class="node accent" x="32" y="70" width="86" height="42" rx="7"/><text x="54" y="95">Test</text>
        <rect class="node" x="164" y="70" width="96" height="42" rx="7"/><text x="182" y="95">Gradient</text>
        <path d="M118 91 H164" stroke="#4f565f" stroke-width="2" marker-end="url(#arrow)"/>
        <path d="M212 112 C208 164, 74 164, 74 112" fill="none" stroke="#4f565f" stroke-width="2" marker-end="url(#arrow)"/>
        <text x="106" y="178">update parameters</text>
      </svg>`,
    method: `
      <svg class="diagram" viewBox="0 0 320 210" role="img" aria-label="EMI design method">
        ${commonArrow}
        <rect class="node accent" x="18" y="78" width="62" height="42" rx="7"/><text x="28" y="103">Split</text>
        <rect class="node" x="108" y="78" width="66" height="42" rx="7"/><text x="124" y="103">Block</text>
        <rect class="node warn" x="202" y="78" width="92" height="42" rx="7"/><text x="214" y="103">Verify</text>
        <path d="M80 99 H108" stroke="#4f565f" stroke-width="2" marker-end="url(#arrow)"/>
        <path d="M174 99 H202" stroke="#4f565f" stroke-width="2" marker-end="url(#arrow)"/>
      </svg>`,
    ground: `
      <svg class="diagram" viewBox="0 0 320 210" role="img" aria-label="ground return current path">
        ${commonArrow}
        <path d="M46 70 H276" stroke="#0f766e" stroke-width="5" stroke-linecap="round"/>
        <path d="M46 140 H276" stroke="#202124" stroke-width="12" stroke-linecap="round"/>
        <path d="M254 70 C246 116, 116 116, 70 140" fill="none" stroke="#b45309" stroke-width="2.5" marker-end="url(#arrow)"/>
        <text x="42" y="52">signal</text><text x="42" y="166">reference plane</text>
      </svg>`,
    shield: `
      <svg class="diagram" viewBox="0 0 320 210" role="img" aria-label="shielded enclosure boundary">
        <rect x="72" y="48" width="176" height="118" rx="10" fill="#d9f0ed" stroke="#0f766e" stroke-width="3" stroke-dasharray="10 6"/>
        <rect class="node" x="122" y="88" width="76" height="38" rx="7"/><text x="140" y="111">Victim</text>
        <path d="M28 106 H72" stroke="#b45309" stroke-width="3"/><path d="M248 106 H292" stroke="#b45309" stroke-width="3"/>
        <text x="88" y="184">filter at boundary</text>
      </svg>`,
    power: `
      <svg class="diagram" viewBox="0 0 320 210" role="img" aria-label="power electronics switching waveform">
        ${commonArrow}
        <rect class="node accent" x="34" y="78" width="74" height="44" rx="7"/><text x="50" y="104">Switch</text>
        <path d="M124 132 V72 H154 V132 H184 V72 H214 V132 H244" fill="none" stroke="#4f46e5" stroke-width="3"/>
        <path d="M108 100 H134" stroke="#4f565f" stroke-width="2" marker-end="url(#arrow)"/>
        <text x="136" y="154">fast dV/dt</text>
      </svg>`,
  };
  return diagrams[kind] || diagrams["emi-chain"];
}

function render() {
  if (state.route === "dashboard") renderDashboard();
  if (state.route === "flashcards") renderFlashcards();
  if (state.route === "quiz") renderQuiz();
  if (state.route === "topic") renderTopic();
  if (state.route === "exam") renderExamPractice();
  typesetMath();
}

function typesetMath() {
  if (!window.MathJax?.typesetPromise) return;
  window.MathJax.typesetClear?.([app]);
  window.MathJax.typesetPromise([app]).catch((error) => {
    console.warn("MathJax typeset failed", error);
  });
}

async function boot() {
  const response = await fetch(DATA_URL);
  studyData = await response.json();
  applyHashRoute();
  render();
}

window.addEventListener("hashchange", () => {
  if (!studyData) return;
  applyHashRoute();
  render();
});

document.addEventListener("click", (event) => {
  const target = event.target.nodeType === 1 ? event.target : event.target.parentElement;
  const link = target?.closest("a[target='_blank'][href*='#topic/']");
  if (!link) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  const opened = window.open(link.href, "_blank");
  if (opened) opened.opener = null;
}, true);

boot();
