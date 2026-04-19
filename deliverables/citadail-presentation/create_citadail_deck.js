"use strict";

const path = require("path");
const pptxgen = require("../../frontend/node_modules/pptxgenjs");
const { imageSizingContain } = require("./pptxgenjs_helpers/image");
const { warnIfSlideHasOverlaps, warnIfSlideElementsOutOfBounds } = require("./pptxgenjs_helpers/layout");
const { safeOuterShadow } = require("./pptxgenjs_helpers/util");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(__dirname, "Citadail_HackPrinceton_Deck.pptx");

const A = {
  navy: "0A2259",
  navy2: "102B66",
  ink: "121A2B",
  muted: "657188",
  line: "D7DEE9",
  bg: "F6F8FB",
  card: "FFFFFF",
  chip: "EAF0F8",
  green: "2F7D54",
  red: "A64242",
  amber: "A77B26",
  black: "0B0F17",
  white: "FFFFFF",
};

const FONT = "Arial";
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Citadail";
pptx.subject = "AI-native equity research desk";
pptx.title = "Citadail HackPrinceton Presentation";
pptx.company = "Citadail";
pptx.lang = "en-US";
pptx.theme = {
  headFontFace: FONT,
  bodyFontFace: FONT,
  lang: "en-US",
};
pptx.defineLayout({ name: "LAYOUT_WIDE", width: 13.333, height: 7.5 });

const assets = {
  citadail: path.join(ROOT, "frontend/app/Citadail.png"),
  photon: path.join(ROOT, "frontend/photon.png"),
  dedalus: path.join(ROOT, "frontend/dedalus-logo.png"),
  eragon: path.join(ROOT, "frontend/eragonai_logo.jpeg"),
  openclaw: path.join(ROOT, "frontend/openclaw-removebg-preview.png"),
};

function addBg(slide, color = A.bg) {
  slide.background = { color };
}

function addLogo(slide, x = 11.55, y = 0.33, w = 1.1, h = 0.35) {
  slide.addImage({
    path: assets.citadail,
    ...imageSizingContain(assets.citadail, x, y, w, h),
  });
}

function addFooter(slide, label) {
  slide.addShape(pptx.ShapeType.line, {
    x: 0.52,
    y: 7.05,
    w: 12.25,
    h: 0,
    line: { color: A.line, width: 0.7 },
  });
  slide.addText("CITADAIL", {
    x: 0.55,
    y: 7.15,
    w: 1.4,
    h: 0.16,
    fontFace: FONT,
    fontSize: 6.8,
    color: A.muted,
    bold: true,
    charSpace: 1.6,
    margin: 0,
  });
  slide.addText(label, {
    x: 11.2,
    y: 7.13,
    w: 1.55,
    h: 0.18,
    fontFace: FONT,
    fontSize: 6.8,
    color: A.muted,
    align: "right",
    margin: 0,
  });
}

function qa(slide) {
  warnIfSlideHasOverlaps(slide, pptx, {
    muteContainment: true,
    ignoreLines: true,
    ignoreDecorativeShapes: true,
  });
  warnIfSlideElementsOutOfBounds(slide, pptx);
}

function title(slide, eyebrow, heading, sub, opts = {}) {
  const x = opts.x ?? 0.62;
  const y = opts.y ?? 0.6;
  const w = opts.w ?? 6.8;
  slide.addText(eyebrow.toUpperCase(), {
    x,
    y,
    w,
    h: 0.18,
    fontFace: FONT,
    fontSize: 7.3,
    color: opts.eyebrowColor ?? A.muted,
    bold: true,
    charSpace: 1.7,
    margin: 0,
  });
  slide.addText(heading, {
    x,
    y: y + 0.32,
    w,
    h: opts.headingH ?? 0.62,
    fontFace: FONT,
    fontSize: opts.size ?? 26,
    color: opts.color ?? A.ink,
    bold: true,
    breakLine: false,
    fit: "shrink",
    margin: 0,
  });
  if (sub) {
    slide.addText(sub, {
      x,
      y: y + (opts.subY ?? 0.98),
      w: opts.subW ?? w,
      h: opts.subH ?? 0.28,
      fontFace: FONT,
      fontSize: opts.subSize ?? 8.8,
      color: opts.subColor ?? A.muted,
      breakLine: false,
      fit: "shrink",
      margin: 0,
      valign: "mid",
    });
  }
}

function card(slide, x, y, w, h, opts = {}) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.05,
    fill: { color: opts.fill ?? A.card, transparency: opts.transparency ?? 0 },
    line: { color: opts.line ?? A.line, width: opts.lineWidth ?? 0.8 },
    shadow: opts.shadow === false ? undefined : safeOuterShadow("28466E", 0.08, 45, 1, 1),
  });
}

function chip(slide, text, x, y, w, opts = {}) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h: opts.h ?? 0.34,
    rectRadius: 0.05,
    fill: { color: opts.fill ?? A.chip },
    line: { color: opts.line ?? A.line, width: 0.5 },
  });
  slide.addText(text, {
    x: x + 0.12,
    y: y + 0.095,
    w: w - 0.24,
    h: 0.13,
    fontFace: FONT,
    fontSize: opts.fontSize ?? 7.5,
    color: opts.color ?? A.navy,
    bold: opts.bold ?? true,
    margin: 0,
    align: opts.align ?? "center",
  });
}

function label(slide, text, x, y, w, opts = {}) {
  slide.addText(text.toUpperCase(), {
    x,
    y,
    w,
    h: opts.h ?? 0.15,
    fontFace: FONT,
    fontSize: opts.size ?? 6.8,
    color: opts.color ?? A.muted,
    bold: true,
    charSpace: 1.2,
    margin: 0,
  });
}

function body(slide, text, x, y, w, h, opts = {}) {
  slide.addText(text, {
    x,
    y,
    w,
    h,
    fontFace: FONT,
    fontSize: opts.size ?? 10.2,
    color: opts.color ?? A.ink,
    bold: opts.bold ?? false,
    fit: "shrink",
    breakLine: false,
    margin: opts.margin ?? 0,
    valign: opts.valign ?? "top",
    align: opts.align ?? "left",
  });
}

function stat(slide, x, y, w, h, k, v, opts = {}) {
  card(slide, x, y, w, h, {
    fill: opts.fill ?? A.card,
    line: opts.line ?? A.line,
    shadow: opts.shadow ?? false,
  });
  label(slide, k, x + 0.16, y + 0.17, w - 0.32, { size: 6.4 });
  slide.addText(v, {
    x: x + 0.16,
    y: y + 0.48,
    w: w - 0.32,
    h: 0.28,
    fontFace: FONT,
    fontSize: opts.valueSize ?? 15.5,
    bold: true,
    color: opts.color ?? A.ink,
    margin: 0,
    fit: "shrink",
  });
}

function line(slide, x1, y1, x2, y2, color = A.line, width = 1) {
  slide.addShape(pptx.ShapeType.line, {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    line: { color, width },
  });
}

function arrow(slide, x1, y1, x2, y2, color = A.navy, width = 1.4) {
  slide.addShape(pptx.ShapeType.line, {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    line: { color, width, endArrowType: "triangle" },
  });
}

function miniDoc(slide, x, y, w, h, titleText, bodyLines, opts = {}) {
  card(slide, x, y, w, h, { fill: opts.fill ?? A.card, shadow: opts.shadow ?? false });
  label(slide, titleText, x + 0.16, y + 0.17, w - 0.32, { color: opts.labelColor ?? A.muted });
  const top = y + 0.48;
  bodyLines.forEach((text, i) => {
    const yy = top + i * 0.28;
    slide.addShape(pptx.ShapeType.rect, {
      x: x + 0.16,
      y: yy,
      w: Math.max(0.25, (w - 0.36) * text),
      h: 0.07,
      fill: { color: opts.barColor ?? "C8D2DF" },
      line: { color: opts.barColor ?? "C8D2DF", transparency: 100 },
    });
  });
}

function drawCurve(slide, x, y, w, h, values, opts = {}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 1);
  const pts = values.map((v, i) => ({
    x: x + (w * i) / (values.length - 1),
    y: y + h - ((v - min) / spread) * h,
  }));
  line(slide, x, y + h, x + w, y + h, opts.grid ?? A.line, 0.7);
  line(slide, x, y + h * 0.5, x + w, y + h * 0.5, opts.grid ?? A.line, 0.45);
  line(slide, x, y, x + w, y, opts.grid ?? A.line, 0.45);
  for (let i = 0; i < pts.length - 1; i += 1) {
    line(slide, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, opts.color ?? A.green, opts.width ?? 2);
  }
  pts.forEach((p, i) => {
    if (i === 0 || i === pts.length - 1 || i % 2 === 0) {
      slide.addShape(pptx.ShapeType.ellipse, {
        x: p.x - 0.035,
        y: p.y - 0.035,
        w: 0.07,
        h: 0.07,
        fill: { color: opts.color ?? A.green },
        line: { color: A.white, width: 0.6 },
      });
    }
  });
}

function bullets(slide, items, x, y, w, opts = {}) {
  items.forEach((item, i) => {
    const yy = y + i * (opts.gap ?? 0.46);
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: yy + 0.04,
      w: 0.11,
      h: 0.11,
      rectRadius: 0.02,
      fill: { color: opts.dot ?? A.navy },
      line: { color: opts.dot ?? A.navy, transparency: 100 },
    });
    body(slide, item, x + 0.22, yy, w - 0.22, opts.lineH ?? 0.32, {
      size: opts.size ?? 9.2,
      color: opts.color ?? A.ink,
    });
  });
}

function addSponsorStrip(slide, x, y) {
  const items = [
    ["Eragon", "Agent runtime", assets.eragon],
    ["Dedalus", "Machine layer", assets.dedalus],
    ["Photon", "Message layer", assets.photon],
  ];
  items.forEach((item, i) => {
    const xx = x + i * 2.38;
    card(slide, xx, y, 2.13, 0.62, { fill: "F0F3F8", shadow: false });
    slide.addImage({ path: item[2], ...imageSizingContain(item[2], xx + 0.12, y + 0.13, 0.34, 0.34) });
    body(slide, item[0], xx + 0.54, y + 0.14, 1.34, 0.15, {
      size: 7.3,
      bold: true,
      color: A.navy,
    });
    label(slide, item[1], xx + 0.54, y + 0.34, 1.42, { size: 5.9, color: A.muted });
  });
}

function slide1() {
  const s = pptx.addSlide();
  addBg(s, A.navy);
  addLogo(s, 0.62, 0.45, 1.18, 0.36);
  addSponsorStrip(s, 6.0, 0.38);
  s.addText("AI-native investment desk", {
    x: 0.72,
    y: 1.42,
    w: 5.9,
    h: 0.32,
    fontFace: FONT,
    fontSize: 10,
    color: "B6C4D8",
    bold: true,
    charSpace: 1.4,
    margin: 0,
  });
  s.addText("Citadail", {
    x: 0.68,
    y: 1.85,
    w: 5.2,
    h: 0.92,
    fontFace: FONT,
    fontSize: 50,
    bold: true,
    color: A.white,
    margin: 0,
  });
  s.addText("Research, PM review, risk, paper execution, monitoring, and iMessage collaboration around one Thesis Record.", {
    x: 0.72,
    y: 3.0,
    w: 5.8,
    h: 0.72,
    fontFace: FONT,
    fontSize: 15,
    color: "D7E0ED",
    fit: "shrink",
    margin: 0,
  });
  chip(s, "paper-only", 0.74, 4.05, 1.18, { fill: "DDE7F4", color: A.navy });
  chip(s, "multi-agent", 2.08, 4.05, 1.35, { fill: "DDE7F4", color: A.navy });
  chip(s, "real artifacts", 3.58, 4.05, 1.45, { fill: "DDE7F4", color: A.navy });
  chip(s, "machine-backed proof", 5.18, 4.05, 1.92, { fill: "DDE7F4", color: A.navy });

  const panelX = 7.1;
  card(s, panelX, 1.35, 4.9, 3.86, { fill: "0F2D69", line: "224379", shadow: false });
  label(s, "Current desk state", panelX + 0.32, 1.68, 4.0, { color: "A8B6CC" });
  stat(s, panelX + 0.34, 2.05, 1.38, 0.86, "Return", "+74.4%", { fill: "173B78", line: "295087", color: A.white, shadow: false });
  stat(s, panelX + 1.9, 2.05, 1.38, 0.86, "Win rate", "54.5%", { fill: "173B78", line: "295087", color: A.white, shadow: false });
  stat(s, panelX + 3.46, 2.05, 1.08, 0.86, "Breaches", "0", { fill: "173B78", line: "295087", color: A.white, shadow: false });
  drawCurve(s, panelX + 0.52, 3.3, 3.95, 1.06, [100, 103, 109, 105, 122, 141, 136, 155, 174], {
    color: "74C69D",
    grid: "294978",
    width: 2.3,
  });
  body(s, "OpenClaw on Dedalus completed one replay step. PM package delivered. Thesis-break audit logged.", panelX + 0.38, 4.62, 4.0, 0.34, {
    size: 8.2,
    color: "CAD5E6",
  });
  addFooter(s, "Title");
  s.addNotes("Open with the one-line value proposition: Citadail turns AI from a chat box into an investment desk workflow.");
  qa(s);
}

function slide2() {
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  title(s, "Problem", "Equity research is not one task.", "The real work is a chain of decisions across research, PM, risk, desk, and monitoring. Most AI tools stop at narrative.");
  const cols = [
    ["Research", "Scattered sources", "Memo and model drift apart"],
    ["PM", "Needs short path to conviction", "Asks what breaks the idea"],
    ["Risk", "Needs size and downside", "Rejects weak controls"],
    ["Desk", "Needs trade plan and P&L", "Manages after the catalyst"],
  ];
  cols.forEach((c, i) => {
    const x = 0.72 + i * 3.03;
    card(s, x, 2.28, 2.65, 2.95, { shadow: false });
    label(s, `0${i + 1}`, x + 0.2, 2.55, 0.5, { color: A.navy });
    body(s, c[0], x + 0.2, 2.82, 2.15, 0.3, { size: 17, bold: true, color: A.ink });
    line(s, x + 0.2, 3.34, x + 2.25, 3.34, A.line, 0.75);
    body(s, c[1], x + 0.2, 3.62, 2.18, 0.4, { size: 10, bold: true, color: A.navy });
    body(s, c[2], x + 0.2, 4.12, 2.18, 0.54, { size: 9.2, color: A.muted });
  });
  arrow(s, 2.96, 3.75, 3.38, 3.75, A.red, 1.2);
  arrow(s, 5.98, 3.75, 6.4, 3.75, A.red, 1.2);
  arrow(s, 9.0, 3.75, 9.42, 3.75, A.red, 1.2);
  card(s, 1.32, 5.78, 10.7, 0.58, { fill: "FFF7EC", line: "E9D4AD", shadow: false });
  body(s, "The gap is not 'can an LLM write a memo?' It is whether an AI system can preserve context, create artifacts, pass gates, manage a paper position, and explain every decision.", 1.58, 5.94, 10.1, 0.18, {
    size: 9,
    color: "6B4B16",
    bold: true,
    align: "center",
  });
  addFooter(s, "Problem");
  s.addNotes("Frame the market gap: finance teams do not need another answer bot. They need workflow-native intelligence with memory and handoffs.");
  qa(s);
}

function slide3() {
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  title(s, "Solution", "One Thesis Record powers the desk.", "Sources converge into a single stateful object. Everything else is a view, artifact, decision, or action derived from it.");
  const inputs = [
    ["Filings", 0.8, 2.02],
    ["Fundamentals", 1.3, 3.0],
    ["News", 0.72, 3.98],
    ["Price", 1.48, 4.9],
    ["Transcripts", 0.82, 5.77],
  ];
  inputs.forEach(([txt, x, y]) => {
    chip(s, txt, x, y, 1.28, { fill: A.card, line: A.line, color: A.ink, h: 0.38 });
    arrow(s, x + 1.48, y + 0.19, 4.22, y + 0.19, "8EA1BB", 0.7);
  });
  card(s, 4.35, 2.55, 3.0, 2.25, { fill: A.navy, line: A.navy2, shadow: true });
  label(s, "central object", 4.7, 2.93, 2.3, { color: "AFC0D7" });
  body(s, "Thesis Record", 4.68, 3.34, 2.18, 0.34, { size: 22, bold: true, color: A.white, align: "center" });
  body(s, "recommendation | conviction | evidence | assumptions | catalysts | risks | invalidation | paper position | monitoring", 4.72, 3.88, 2.1, 0.46, {
    size: 7.2,
    color: "D5DEEC",
    align: "center",
  });
  const outs = [
    ["Memo", 8.35, 2.03],
    ["Financial Model", 9.1, 2.95],
    ["PM Review", 8.55, 3.9],
    ["Trade Desk", 9.28, 4.84],
    ["Live Book", 8.5, 5.78],
  ];
  outs.forEach(([txt, x, y]) => {
    arrow(s, 7.5, y + 0.19, x - 0.16, y + 0.19, A.navy, 0.8);
    chip(s, txt, x, y, 1.62, { fill: A.card, line: A.line, color: A.navy, h: 0.38 });
  });
  addFooter(s, "Solution");
  s.addNotes("The central architecture decision is the Thesis Record. It prevents the system from becoming a grab bag of tools.");
  qa(s);
}

function slide4() {
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  title(s, "Assist Mode", "Human-guided thesis workbench.", "The analyst drives the idea. Citadail generates the package, routes decisions, and keeps artifacts tied to the same thesis.");
  const steps = [
    ["Coverage", "ticker search and coverage desk"],
    ["Thesis", "buy / hold / sell plus rationale"],
    ["Package", "memo, model, PM deck"],
    ["Review", "PM and risk gates"],
    ["Desk", "paper trade and monitor"],
  ];
  steps.forEach((step, i) => {
    const x = 0.72 + i * 2.48;
    card(s, x, 2.02, 2.15, 1.25, { fill: i === 2 ? A.navy : A.card, line: i === 2 ? A.navy : A.line, shadow: false });
    label(s, step[0], x + 0.18, 2.24, 1.72, { color: i === 2 ? "BCC9DB" : A.muted });
    body(s, step[1], x + 0.18, 2.57, 1.72, 0.42, { size: 8.2, color: i === 2 ? A.white : A.ink, bold: i === 2 });
    if (i < steps.length - 1) arrow(s, x + 2.16, 2.64, x + 2.36, 2.64, A.navy, 1);
  });
  card(s, 0.72, 4.0, 3.55, 1.72, { shadow: false });
  label(s, "analyst package", 0.95, 4.28, 2.7);
  miniDoc(s, 1.02, 4.7, 0.8, 0.58, "Memo", [0.72, 0.54, 0.68], { shadow: false });
  miniDoc(s, 2.02, 4.7, 0.8, 0.58, "Model", [0.5, 0.76, 0.62], { shadow: false, barColor: "7EA6CF" });
  miniDoc(s, 3.02, 4.7, 0.8, 0.58, "Deck", [0.7, 0.44, 0.8], { shadow: false, barColor: "A5B6C9" });
  card(s, 4.62, 4.0, 3.8, 1.72, { shadow: false });
  label(s, "decision controls", 4.86, 4.28, 2.7);
  chip(s, "Approve to Risk", 4.9, 4.72, 1.3, { fill: "E8F4ED", color: A.green });
  chip(s, "Send Back", 6.36, 4.72, 1.04, { fill: "F8F1E2", color: A.amber });
  chip(s, "Reject", 7.55, 4.72, 0.68, { fill: "F7E8E8", color: A.red });
  card(s, 8.76, 4.0, 3.25, 1.72, { shadow: false });
  label(s, "paper desk", 9.0, 4.28, 2.4);
  body(s, "Entry 118.20\nCurrent 123.70\nP&L +4.7%\nAction Hold", 9.0, 4.64, 1.52, 0.72, { size: 8.4, color: A.ink, bold: true });
  drawCurve(s, 10.64, 4.56, 1.08, 0.55, [100, 102, 101, 105, 107], { color: A.green, width: 1.4 });
  addFooter(s, "Assist Mode");
  s.addNotes("Show the flow: this is not a form. It is an investment workflow with artifact outputs and gates.");
  qa(s);
}

function slide5() {
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  title(s, "Full Auto", "A walk-forward paper investment firm.", "The system advances through historical time, sees only what was known then, and continuously opens, manages, and exits paper positions.");
  const stages = [
    "Morning Brief",
    "Candidate",
    "Analyst Swarm",
    "PM Synth",
    "Validation",
    "Risk Gate",
    "Desk",
    "Monitor",
    "Journal",
  ];
  stages.forEach((st, i) => {
    const row = i < 5 ? 0 : 1;
    const col = i < 5 ? i : i - 5;
    const x = row ? 0.72 + (4 - col) * 2.42 : 0.72 + col * 2.42;
    const y = row ? 4.42 : 2.45;
    card(s, x, y, 1.72, 0.72, { fill: st === "Validation" ? "FFF7E6" : st === "Desk" ? A.navy : A.card, line: st === "Desk" ? A.navy : A.line, shadow: false });
    body(s, st, x + 0.14, y + 0.23, 1.44, 0.17, { size: 7.6, bold: true, color: st === "Desk" ? A.white : A.ink, align: "center" });
    if (i < 4) arrow(s, x + 1.75, y + 0.36, x + 2.1, y + 0.36, "8EA1BB", 0.8);
    if (i === 4) arrow(s, x + 0.86, y + 0.78, x + 0.86, 4.28, "8EA1BB", 0.8);
    if (row && i < 8) arrow(s, x - 0.04, y + 0.36, x - 0.38, y + 0.36, "8EA1BB", 0.8);
  });
  card(s, 0.82, 6.0, 4.0, 0.66, { fill: "EEF5F1", line: "C9E0D0", shadow: false });
  body(s, "Anti-cheat rule: knownAt <= simulationTime", 1.08, 6.23, 3.5, 0.14, {
    size: 8.4,
    bold: true,
    color: A.green,
    align: "center",
  });
  card(s, 5.05, 6.0, 3.1, 0.66, { fill: "F2F5FA", line: A.line, shadow: false });
  body(s, "Persistent paper book, not one replayed trade", 5.25, 6.23, 2.7, 0.14, {
    size: 8.4,
    bold: true,
    color: A.navy,
    align: "center",
  });
  card(s, 8.38, 6.0, 3.18, 0.66, { fill: "F8F1E2", line: "E7D5AA", shadow: false });
  body(s, "Every material action is journaled", 8.62, 6.23, 2.7, 0.14, {
    size: 8.4,
    bold: true,
    color: A.amber,
    align: "center",
  });
  addFooter(s, "Full Auto");
  s.addNotes("The key credibility claim: this is a walk-forward simulation with time isolation, not hindsight optimization.");
  qa(s);
}

function slide6() {
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  title(s, "Desk Output", "The run is measurable.", "Full Auto produces a paper book, open positions, an equity curve, and a decision journal.");
  card(s, 0.72, 2.0, 7.1, 3.56, { shadow: false });
  label(s, "paper book equity", 1.02, 2.28, 2.5);
  drawCurve(s, 1.06, 3.04, 5.78, 1.55, [100, 108, 119, 111, 132, 151, 144, 167, 174.4], {
    color: A.green,
    width: 2.6,
  });
  body(s, "$1.00M", 1.05, 4.78, 0.7, 0.12, { size: 7, color: A.muted });
  body(s, "$1.74M", 6.2, 2.78, 0.7, 0.12, { size: 7, color: A.green, bold: true });
  stat(s, 8.22, 2.0, 1.3, 0.84, "Total return", "+74.4%", { color: A.green, shadow: false });
  stat(s, 9.76, 2.0, 1.3, 0.84, "Max DD", "-16.1%", { color: A.red, shadow: false });
  stat(s, 11.3, 2.0, 1.3, 0.84, "Win rate", "54.5%", { color: A.ink, shadow: false });
  stat(s, 8.22, 3.14, 1.3, 0.84, "Avg W/L", "4.3x", { color: A.ink, shadow: false });
  stat(s, 9.76, 3.14, 1.3, 0.84, "Breaks", "4 / 4", { color: A.green, shadow: false });
  stat(s, 11.3, 3.14, 1.3, 0.84, "Breaches", "0", { color: A.green, shadow: false });
  card(s, 8.22, 4.46, 4.38, 1.1, { fill: A.navy, line: A.navy2, shadow: false });
  label(s, "driver attribution", 8.48, 4.72, 2.4, { color: "B9C8DD" });
  const drivers = [["MSFT", "+274.7%"], ["AMD", "+218.7%"], ["NOW", "+180.5%"], ["NVDA", "+166.9%"]];
  drivers.forEach((d, i) => chip(s, `${d[0]}  ${d[1]}`, 8.48 + i * 0.98, 5.05, 0.86, { fill: "E6EEF9", color: A.navy, fontSize: 5.6, h: 0.28 }));
  addFooter(s, "Scorecard");
  s.addNotes("Do not overclaim this as audited alpha. Pitch it as a visible operating desk with useful diagnostics and paper-only scorekeeping.");
  qa(s);
}

function slide7() {
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  title(s, "Technical Architecture", "A product shell with real execution paths.", "The judges should see the stack: Next.js workbench, server APIs, Full Auto runtime, Spectrum/iMessage, and Dedalus/OpenClaw proof.");
  const rows = [
    ["Interface", "Landing, tabbed workbench, Full Auto control room, sidebar chat"],
    ["Server APIs", "Generation, Office export, Full Auto step, runtime status, market brief"],
    ["Core State", "Session, EquityProject, ThesisRecord, PaperPosition, Journal"],
    ["Agent Runtime", "Morning Brief -> Analyst Swarm -> PM -> Validation -> Risk -> Desk -> Monitor"],
    ["Ambient Layer", "Spectrum TypeScript agent for iMessage and terminal"],
    ["Machine Proof", "Dedalus runtime adapter with OpenClaw step proof and local fallback"],
  ];
  rows.forEach((r, i) => {
    const y = 1.9 + i * 0.72;
    card(s, 0.76, y, 11.65, 0.5, { fill: i % 2 ? "FDFEFF" : "F0F4FA", shadow: false });
    label(s, r[0], 1.0, y + 0.17, 2.0, { color: A.navy, size: 6.4 });
    body(s, r[1], 3.1, y + 0.15, 8.8, 0.14, { size: 8.3, color: A.ink });
  });
  const x = 0.9;
  const y = 6.28;
  chip(s, "Next.js", x, y, 0.86);
  chip(s, "Gemini", x + 1.0, y, 0.82);
  chip(s, "Office files", x + 1.96, y, 1.18);
  chip(s, "Spectrum", x + 3.28, y, 0.98);
  chip(s, "Dedalus", x + 4.4, y, 0.9);
  chip(s, "OpenClaw", x + 5.44, y, 1.02);
  chip(s, "Historical replay", x + 6.6, y, 1.42);
  addFooter(s, "Architecture");
  s.addNotes("This slide is the judge reference slide. It maps features to implementation surfaces.");
  qa(s);
}

function slide8() {
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  title(s, "Ambient PM Layer", "The desk also lives in iMessage.", "Spectrum turns Citadail into a PM group-chat participant, not just a web app.");
  card(s, 0.9, 1.86, 4.1, 4.62, { fill: "111827", line: "1F2937", shadow: true });
  s.addShape(pptx.ShapeType.roundRect, {
    x: 1.18,
    y: 2.2,
    w: 3.55,
    h: 3.84,
    rectRadius: 0.12,
    fill: { color: "F4F7FB" },
    line: { color: "2D3748", width: 1 },
  });
  body(s, "PM group", 1.42, 2.42, 2.2, 0.16, { size: 7.2, bold: true, color: A.muted });
  const bubbles = [
    ["Citadail book", "E6ECF6", A.ink, 1.38, 2.84, 1.46],
    ["Book up +74.4%. 10 open paper positions. No exposure breaches.", A.navy, A.white, 2.05, 3.3, 2.36],
    ["Citadail news AAPL", "E6ECF6", A.ink, 1.38, 4.08, 1.8],
    ["AAPL visible sources: services durability, margin discipline, and current thesis intact.", A.navy, A.white, 1.78, 4.52, 2.62],
  ];
  bubbles.forEach(([txt, fill, color, x, y, w]) => {
    s.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h: 0.43,
      rectRadius: 0.08,
      fill: { color: fill },
      line: { color: fill, transparency: 100 },
    });
    body(s, txt, x + 0.12, y + 0.12, w - 0.24, 0.1, { size: 6.1, color, fit: "shrink" });
  });
  const proof = [
    ["Trigger rules", "Group chats require Citadail or cd prefix"],
    ["Attachments", "Memo, model, and deck can be sent from the same project data"],
    ["News", "Ticker-specific replay/source responses"],
    ["Runtime", "PM can ask if Dedalus/OpenClaw is healthy"],
  ];
  proof.forEach((p, i) => {
    card(s, 5.78, 2.0 + i * 0.88, 5.78, 0.62, { fill: A.card, shadow: false });
    label(s, p[0], 6.02, 2.2 + i * 0.88, 1.6, { color: A.navy });
    body(s, p[1], 7.72, 2.18 + i * 0.88, 3.42, 0.14, { size: 8.2, color: A.ink });
  });
  s.addImage({ path: assets.photon, ...imageSizingContain(assets.photon, 11.66, 1.88, 0.48, 0.48) });
  addFooter(s, "Photon / Spectrum");
  s.addNotes("This connects directly to the Photon track: real group-chat participation with context and controlled actions.");
  qa(s);
}

function slide9() {
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  title(s, "Runtime Proof", "Machine-backed when available. Safe when not.", "Dedalus and OpenClaw are used where they matter: executing a bounded replay step, persisting proof, and falling back cleanly.", {
    w: 8.7,
    size: 24,
  });
  const left = [
    ["1", "UI sends one bounded step"],
    ["2", "Runtime wrapper tries Dedalus/OpenClaw"],
    ["3", "Remote output shape is validated"],
    ["4", "Proof is persisted and surfaced"],
    ["5", "Hybrid falls back locally if needed"],
  ];
  left.forEach((r, i) => {
    const y = 1.95 + i * 0.66;
    chip(s, r[0], 0.88, y, 0.34, { fill: A.navy, color: A.white, h: 0.3 });
    body(s, r[1], 1.38, y + 0.06, 4.1, 0.14, { size: 9.1, color: A.ink, bold: i === 1 });
  });
  card(s, 6.08, 1.98, 5.58, 2.84, { fill: A.navy, line: A.navy2, shadow: true });
  s.addImage({ path: assets.dedalus, ...imageSizingContain(assets.dedalus, 6.38, 2.22, 0.58, 0.58) });
  s.addImage({ path: assets.openclaw, ...imageSizingContain(assets.openclaw, 7.18, 2.22, 0.58, 0.58) });
  label(s, "proof object", 8.0, 2.34, 2.4, { color: "B8C8DD" });
  body(s, "OpenClaw on Dedalus completed one replay step at Apr 21, 2022 with 28 agent events.", 6.42, 3.08, 4.7, 0.54, {
    size: 13,
    bold: true,
    color: A.white,
    align: "center",
  });
  chip(s, "remote_success", 6.62, 4.02, 1.32, { fill: "DDE7F4", color: A.navy });
  chip(s, "execution id", 8.15, 4.02, 1.06, { fill: "DDE7F4", color: A.navy });
  chip(s, "latest 3 proofs", 9.4, 4.02, 1.34, { fill: "DDE7F4", color: A.navy });
  card(s, 6.08, 5.22, 5.58, 0.74, { fill: "EEF5F1", line: "C9E0D0", shadow: false });
  body(s, "No arbitrary browser shell. No secrets to client. Paper-only state sync.", 6.36, 5.5, 5.02, 0.14, {
    size: 8.8,
    bold: true,
    color: A.green,
    align: "center",
  });
  addFooter(s, "Dedalus / OpenClaw");
  s.addNotes("Sponsor proof slide. Emphasize that proof beats broad claims: one real bounded execution path is enough and safer.");
  qa(s);
}

function slide10() {
  const s = pptx.addSlide();
  addBg(s);
  addLogo(s);
  title(s, "Why This Wins", "It is not a prompt demo. It is a working desk.", "Citadail scores because the agent creates durable work, coordinates with humans, and leaves an auditable trail.");
  const wins = [
    ["Depth of action", "Generates thesis, artifacts, PM review, risk gate, paper trade, monitor, and journal."],
    ["Context quality", "Every replay step is time-bounded and source-filtered by simulation time."],
    ["Hybrid intelligence", "Assist Mode keeps the human in charge; Full Auto shows the system running the loop."],
    ["Sponsor fit", "Spectrum for iMessage, OpenClaw-style agent runtime, Dedalus machine proof."],
    ["Demo clarity", "Four visible proof signals: OpenClaw execution, PM delivery, iMessage response, thesis-break audit."],
  ];
  wins.forEach((w, i) => {
    const x = i < 3 ? 0.78 + i * 4.0 : 2.75 + (i - 3) * 4.0;
    const y = i < 3 ? 2.02 : 4.42;
    card(s, x, y, 3.45, 1.55, { fill: i === 0 ? A.navy : A.card, line: i === 0 ? A.navy : A.line, shadow: false });
    label(s, w[0], x + 0.22, y + 0.24, 2.92, { color: i === 0 ? "B8C8DD" : A.navy });
    body(s, w[1], x + 0.22, y + 0.63, 2.92, 0.52, { size: 8.5, color: i === 0 ? A.white : A.ink, bold: i === 0 });
  });
  card(s, 3.2, 6.35, 6.9, 0.42, { fill: "EEF5F1", line: "C9E0D0", shadow: false });
  body(s, "A PM can use it Monday: ask for the book, inspect a thesis, download the package, and see why every paper decision happened.", 3.42, 6.49, 6.46, 0.1, {
    size: 7.7,
    color: A.green,
    bold: true,
    align: "center",
  });
  addFooter(s, "Close");
  s.addNotes("Close with working utility, not speculation. This is a cohesive product with proof surfaces.");
  qa(s);
}

[
  slide1,
  slide2,
  slide3,
  slide4,
  slide5,
  slide6,
  slide7,
  slide8,
  slide9,
  slide10,
].forEach((fn) => fn());

pptx.writeFile({ fileName: OUT });
