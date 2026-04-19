"use strict";

const path = require("path");
const pptxgen = require("../../frontend/node_modules/pptxgenjs");
const {
  warnIfSlideHasOverlaps,
  warnIfSlideElementsOutOfBounds,
} = require("./pptxgenjs_helpers/layout");

const OUT = path.join(__dirname, "Citadail_HackPrinceton_Deck_v2.pptx");

const C = {
  black: "050505",
  ink: "101010",
  white: "FFFFFF",
  paper: "F7F7F5",
  card: "FFFFFF",
  soft: "E8E8E4",
  line: "C9C9C2",
  muted: "6F6F68",
  mid: "9B9B91",
  dark: "242424",
};

const FONT = "Arial";
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Citadail";
pptx.company = "Citadail";
pptx.subject = "AI coworkers for an investment desk";
pptx.title = "Citadail HackPrinceton Presentation V2";
pptx.lang = "en-US";
pptx.theme = {
  headFontFace: FONT,
  bodyFontFace: FONT,
  lang: "en-US",
};
pptx.defineLayout({ name: "LAYOUT_WIDE", width: 13.333, height: 7.5 });

function qa(slide) {
  warnIfSlideHasOverlaps(slide, pptx, {
    muteContainment: true,
    ignoreLines: true,
    ignoreDecorativeShapes: true,
  });
  warnIfSlideElementsOutOfBounds(slide, pptx);
}

function bg(slide, color = C.paper) {
  slide.background = { color };
}

function wordmark(slide, color = C.black) {
  slide.addText("CITADAIL", {
    x: 0.55,
    y: 0.34,
    w: 1.35,
    h: 0.2,
    fontFace: FONT,
    fontSize: 10,
    bold: true,
    color,
    charSpace: 1.1,
    margin: 0,
  });
}

function footer(slide, label, dark = false) {
  const color = dark ? "B8B8B2" : C.muted;
  const line = dark ? "3C3C3A" : C.line;
  slide.addShape(pptx.ShapeType.line, {
    x: 0.55,
    y: 7.03,
    w: 12.25,
    h: 0,
    line: { color: line, width: 0.7 },
  });
  slide.addText(label, {
    x: 10.45,
    y: 7.14,
    w: 2.35,
    h: 0.18,
    fontFace: FONT,
    fontSize: 8,
    color,
    align: "right",
    margin: 0,
  });
}

function title(slide, eyebrow, text, sub, dark = false) {
  const primary = dark ? C.white : C.black;
  const secondary = dark ? "D4D4CF" : C.muted;
  slide.addText(eyebrow.toUpperCase(), {
    x: 0.62,
    y: 0.88,
    w: 4.2,
    h: 0.2,
    fontFace: FONT,
    fontSize: 10,
    bold: true,
    color: secondary,
    charSpace: 1.6,
    margin: 0,
  });
  slide.addText(text, {
    x: 0.6,
    y: 1.23,
    w: 8.7,
    h: 0.72,
    fontFace: FONT,
    fontSize: 32,
    bold: true,
    color: primary,
    margin: 0,
  });
  if (sub) {
    slide.addText(sub, {
      x: 0.62,
      y: 2.05,
      w: 8.2,
      h: 0.36,
      fontFace: FONT,
      fontSize: 15,
      color: secondary,
      margin: 0,
    });
  }
}

function card(slide, x, y, w, h, opts = {}) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.045,
    fill: { color: opts.fill ?? C.card },
    line: { color: opts.line ?? C.line, width: opts.lineWidth ?? 0.8 },
  });
}

function label(slide, text, x, y, w, opts = {}) {
  slide.addText(text.toUpperCase(), {
    x,
    y,
    w,
    h: 0.18,
    fontFace: FONT,
    fontSize: opts.size ?? 9,
    bold: true,
    charSpace: 1.4,
    color: opts.color ?? C.muted,
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
    fontSize: opts.size ?? 16,
    bold: opts.bold ?? false,
    color: opts.color ?? C.ink,
    margin: opts.margin ?? 0,
    breakLine: false,
    valign: opts.valign ?? "top",
    align: opts.align ?? "left",
  });
}

function pill(slide, text, x, y, w, opts = {}) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h: opts.h ?? 0.38,
    rectRadius: 0.04,
    fill: { color: opts.fill ?? C.black },
    line: { color: opts.line ?? C.black, width: 0.7 },
  });
  slide.addText(text, {
    x: x + 0.1,
    y: y + 0.1,
    w: w - 0.2,
    h: 0.15,
    fontFace: FONT,
    fontSize: opts.size ?? 9,
    bold: true,
    color: opts.color ?? C.white,
    align: "center",
    margin: 0,
    charSpace: opts.charSpace ?? 0.3,
  });
}

function arrow(slide, x1, y1, x2, y2, opts = {}) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  slide.addShape(pptx.ShapeType.line, {
    x,
    y,
    w,
    h,
    line: {
      color: opts.color ?? C.black,
      width: opts.width ?? 1.2,
    },
  });
}

function miniStat(slide, x, y, w, k, v, opts = {}) {
  card(slide, x, y, w, 0.82, { fill: opts.fill ?? C.white });
  label(slide, k, x + 0.16, y + 0.15, w - 0.32, { size: 7.8 });
  body(slide, v, x + 0.16, y + 0.39, w - 0.32, 0.26, {
    size: opts.size ?? 20,
    bold: true,
  });
}

function smallDot(slide, x, y, text, dark = false) {
  slide.addShape(pptx.ShapeType.ellipse, {
    x,
    y,
    w: 0.13,
    h: 0.13,
    fill: { color: dark ? C.white : C.black },
    line: { color: dark ? C.white : C.black, width: 0 },
  });
  body(slide, text, x + 0.25, y - 0.05, 3.5, 0.25, {
    size: 13,
    color: dark ? C.white : C.ink,
  });
}

function drawEquityCurve(slide, x, y, w, h, dark = false) {
  const values = [100, 96, 112, 137, 171, 202, 246];
  const min = 88;
  const max = 255;
  const points = values.map((value, index) => ({
    x: x + (w / (values.length - 1)) * index,
    y: y + h - ((value - min) / (max - min)) * h,
  }));
  const grid = dark ? "555550" : C.line;
  for (let i = 0; i < 3; i += 1) {
    slide.addShape(pptx.ShapeType.line, {
      x,
      y: y + (h / 2) * i,
      w,
      h: 0,
      line: { color: grid, width: 0.5 },
    });
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    slide.addShape(pptx.ShapeType.line, {
      x: points[i].x,
      y: points[i].y,
      w: points[i + 1].x - points[i].x,
      h: points[i + 1].y - points[i].y,
      line: { color: dark ? C.white : C.black, width: 2.2 },
    });
  }
  for (const point of points) {
    slide.addShape(pptx.ShapeType.ellipse, {
      x: point.x - 0.045,
      y: point.y - 0.045,
      w: 0.09,
      h: 0.09,
      fill: { color: dark ? C.white : C.black },
      line: { color: dark ? C.white : C.black, width: 0 },
    });
  }
  body(slide, "Jan 2022", x, y + h + 0.14, 1.1, 0.2, {
    size: 8,
    color: dark ? "D4D4CF" : C.muted,
  });
  body(slide, "Apr 2026", x + w - 1.1, y + h + 0.14, 1.1, 0.2, {
    size: 8,
    color: dark ? "D4D4CF" : C.muted,
    align: "right",
  });
}

// 1
{
  const slide = pptx.addSlide();
  bg(slide, C.black);
  wordmark(slide, C.white);
  slide.addText("Imagine an investment fund made of AI coworkers.", {
    x: 0.72,
    y: 1.55,
    w: 9.8,
    h: 1.45,
    fontFace: FONT,
    fontSize: 42,
    bold: true,
    color: C.white,
    margin: 0,
    breakLine: false,
  });
  body(
    slide,
    "One finds what matters. One builds the case. One checks risk. One places the paper trade. One keeps watch.",
    0.76,
    3.35,
    8.95,
    0.56,
    { size: 18, color: "D8D8D3" },
  );
  const roles = ["Brief", "Analyst", "PM", "Risk", "Desk", "Monitor"];
  roles.forEach((role, idx) => {
    const x = 0.78 + idx * 1.55;
    pill(slide, role, x, 5.35, 1.17, {
      fill: idx === 0 ? C.white : C.black,
      line: C.white,
      color: idx === 0 ? C.black : C.white,
      size: 9.2,
    });
    if (idx < roles.length - 1) arrow(slide, x + 1.2, 5.54, x + 1.47, 5.54, { color: C.white, width: 0.9 });
  });
  footer(slide, "Plain-English thesis", true);
  qa(slide);
}

// 2
{
  const slide = pptx.addSlide();
  bg(slide);
  wordmark(slide);
  title(slide, "Problem", "Investment work is fragmented.", "The information arrives everywhere. The decision needs to live in one place.");
  const fragments = [
    ["Filings", 0.9, 3.2, 1.85],
    ["Fundamentals", 2.72, 4.55, 2.2],
    ["News", 4.9, 3.55, 1.85],
    ["Price", 7.0, 4.75, 1.85],
    ["Transcripts", 9.15, 3.15, 2.05],
  ];
  fragments.forEach(([text, x, y, w], idx) => {
    card(slide, x, y, w, 0.8, { fill: idx % 2 ? C.white : C.soft });
    body(slide, text, x + 0.17, y + 0.27, w - 0.34, 0.22, { size: 15, bold: true, align: "center" });
  });
  card(slide, 10.4, 4.78, 2.1, 0.86, { fill: C.black, line: C.black });
  body(slide, "PM asks:\nwhat is the bet?", 10.6, 5.0, 1.7, 0.35, {
    size: 12,
    color: C.white,
    bold: true,
    align: "center",
  });
  footer(slide, "Why this matters");
  qa(slide);
}

// 3
{
  const slide = pptx.addSlide();
  bg(slide);
  wordmark(slide);
  title(slide, "Solution", "One Thesis Record becomes the desk memory.", "Every coworker writes to the same object. Every artifact reads from it.");
  card(slide, 4.55, 2.62, 4.2, 1.52, { fill: C.black, line: C.black });
  body(slide, "Thesis Record", 5.0, 3.0, 3.3, 0.42, {
    size: 25,
    bold: true,
    color: C.white,
    align: "center",
  });
  body(slide, "ticker · view · evidence · risk · trade · monitor", 5.05, 3.51, 3.2, 0.22, {
    size: 10,
    color: "DADAD6",
    align: "center",
  });
  const nodes = [
    ["Brief Agent", "finds what changed", 0.8, 2.78, 2.35],
    ["Sector Analyst", "builds the case", 0.8, 4.75, 2.35],
    ["PM Agent", "challenges the bet", 5.0, 5.45, 2.35],
    ["Risk Agent", "sizes the risk", 10.1, 2.78, 2.35],
    ["Desk Agent", "opens paper trade", 10.1, 4.75, 2.35],
  ];
  nodes.forEach(([name, desc, x, y, w]) => {
    card(slide, x, y, w, 0.8, { fill: C.white });
    body(slide, name, x + 0.16, y + 0.16, w - 0.32, 0.2, { size: 13, bold: true });
    body(slide, desc, x + 0.16, y + 0.45, w - 0.32, 0.18, { size: 10.5, color: C.muted });
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 3.28,
    y: 3.38,
    w: 1.05,
    h: 0,
    line: { color: C.black, width: 1.1 },
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 8.9,
    y: 3.38,
    w: 1.05,
    h: 0,
    line: { color: C.black, width: 1.1 },
  });
  footer(slide, "Core object");
  qa(slide);
}

// 4
{
  const slide = pptx.addSlide();
  bg(slide, C.black);
  wordmark(slide, C.white);
  title(slide, "Motion Story", "Sources converge. Work products fan out.", "This is the product in one picture.", true);
  const inputs = ["Filings", "Fundamentals", "News", "Price", "Transcripts"];
  inputs.forEach((name, idx) => {
    pill(slide, name, 0.88, 3.0 + idx * 0.48, 1.75, {
      fill: C.black,
      line: C.white,
      color: C.white,
      size: 8.1,
    });
  });
  body(slide, "→", 3.06, 3.84, 0.45, 0.28, {
    size: 24,
    bold: true,
    color: C.white,
    align: "center",
  });
  card(slide, 3.85, 3.22, 3.0, 1.28, { fill: C.white, line: C.white });
  body(slide, "Thesis\nRecord", 4.14, 3.54, 2.4, 0.58, {
    size: 25,
    bold: true,
    color: C.black,
    align: "center",
  });
  body(slide, "→", 7.1, 3.84, 0.45, 0.28, {
    size: 24,
    bold: true,
    color: C.white,
    align: "center",
  });
  const outs = [
    ["Memo", 8.0, 3.0],
    ["Model", 10.0, 3.0],
    ["Trade Desk", 8.0, 4.05],
    ["Book Equity", 10.0, 4.05],
  ];
  outs.forEach(([name, x, y]) => {
    pill(slide, name, x, y, 1.55, { fill: C.white, line: C.white, color: C.black, size: 8.4 });
  });
  footer(slide, "Visual logic", true);
  qa(slide);
}

// 5
{
  const slide = pptx.addSlide();
  bg(slide);
  wordmark(slide);
  title(slide, "Product", "Two modes. Same desk brain.", "Assist is human-guided. Full Auto is system-run under paper-risk limits.");
  card(slide, 0.74, 2.75, 5.55, 2.85, { fill: C.white });
  label(slide, "Assist Mode", 1.05, 3.05, 2.3);
  body(slide, "A human picks the ticker.\nCitadail builds the thesis package.\nPM/Risk/Desk decisions stay visible.", 1.05, 3.55, 4.75, 1.15, { size: 17, bold: true });
  pill(slide, "one thesis package", 1.05, 4.98, 2.05, { fill: C.black });
  card(slide, 7.05, 2.75, 5.55, 2.85, { fill: C.black, line: C.black });
  label(slide, "Full Auto Mode", 7.36, 3.05, 2.3, { color: "D8D8D2" });
  body(slide, "The system scans the replay.\nAgents approve, size, open, and monitor.\nEvery action is journaled.", 7.36, 3.55, 4.75, 1.15, { size: 17, bold: true, color: C.white });
  pill(slide, "paper book loop", 7.36, 4.98, 1.85, { fill: C.white, line: C.white, color: C.black });
  footer(slide, "User experience");
  qa(slide);
}

// 6
{
  const slide = pptx.addSlide();
  bg(slide);
  wordmark(slide);
  title(slide, "Full Auto", "A walk-forward paper desk.", "Not a single trade replay. A portfolio that evolves through time.");
  const stages = [
    ["Morning Brief", "scans visible sources"],
    ["Candidate", "selects names"],
    ["Analyst Swarm", "builds thesis"],
    ["PM", "approves or rejects"],
    ["Risk", "sizes exposure"],
    ["Desk", "opens paper trade"],
    ["Monitor", "keeps watch"],
  ];
  stages.forEach(([name, desc], idx) => {
    const x = 0.74 + idx * 1.78;
    card(slide, x, 3.05, 1.47, 1.1, { fill: idx === 5 ? C.black : C.white, line: C.black });
    body(slide, name, x + 0.1, 3.28, 1.27, 0.22, {
      size: 11,
      bold: true,
      color: idx === 5 ? C.white : C.black,
      align: "center",
    });
    body(slide, desc, x + 0.13, 3.66, 1.21, 0.28, {
      size: 7.8,
      color: idx === 5 ? "D8D8D2" : C.muted,
      align: "center",
    });
    if (idx < stages.length - 1) arrow(slide, x + 1.5, 3.6, x + 1.73, 3.6, { width: 0.8 });
  });
  smallDot(slide, 1.0, 5.18, "Agents only see data timestamped at or before simulation time.");
  smallDot(slide, 1.0, 5.62, "Paper positions only. No live brokerage. No prediction-market hedges.");
  smallDot(slide, 1.0, 6.06, "The audit journal explains every open, hold, trim, exit, and thesis break.");
  footer(slide, "Autonomous desk loop");
  qa(slide);
}

// 7
{
  const slide = pptx.addSlide();
  bg(slide, C.black);
  wordmark(slide, C.white);
  title(slide, "Proof", "The desk compounds because it can actually deploy.", "A wider universe plus corrected desk rules turns intelligence into book impact.", true);
  miniStat(slide, 0.82, 3.0, 2.1, "Starting Capital", "$1.0M", { fill: C.white, size: 21 });
  miniStat(slide, 3.2, 3.0, 2.1, "Final Book", "$2.46M", { fill: C.white, size: 21 });
  miniStat(slide, 5.58, 3.0, 2.1, "Paper Return", "+145.9%", { fill: C.white, size: 21 });
  miniStat(slide, 7.96, 3.0, 2.1, "Universe", "50 names", { fill: C.white, size: 21 });
  miniStat(slide, 10.34, 3.0, 2.1, "Open Positions", "12", { fill: C.white, size: 21 });
  drawEquityCurve(slide, 1.0, 4.75, 10.95, 1.2, true);
  body(slide, "Top drivers: META · NVDA · AVGO · LLY · PANW", 1.0, 6.39, 10.6, 0.24, {
    size: 14,
    color: C.white,
    bold: true,
    align: "center",
  });
  body(slide, "Historical replay. Paper portfolio only. No future data available to agents.", 1.0, 6.67, 10.6, 0.18, {
    size: 9,
    color: "CFCFC9",
    align: "center",
  });
  footer(slide, "Walk-forward result", true);
  // The chart intentionally places points on line segments; visual render QA checks this slide.
}

// 8
{
  const slide = pptx.addSlide();
  bg(slide);
  wordmark(slide);
  title(slide, "Architecture", "The stack is simple when the story is clear.", "Workbench for humans. Runtime for agents. Messenger for PMs.");
  const boxes = [
    ["Citadail Workbench", "Morning News · Thesis · Memo · Model · PM Review · Risk Gate · Trade Desk", 0.82, 3.08, 3.35],
    ["OpenClaw Runtime", "agent graph executes bounded desk steps", 4.98, 2.45, 3.35],
    ["Dedalus Machine", "persistent state and execution proof", 4.98, 3.72, 3.35],
    ["Photon iMessage", "PM group chat receives briefs, charts, and artifacts", 9.1, 3.08, 3.35],
  ];
  boxes.forEach(([name, desc, x, y, w], idx) => {
    card(slide, x, y, w, 0.94, { fill: idx === 1 ? C.black : C.white, line: C.black });
    body(slide, name, x + 0.18, y + 0.17, w - 0.36, 0.22, {
      size: 13.5,
      bold: true,
      color: idx === 1 ? C.white : C.black,
    });
    body(slide, desc, x + 0.18, y + 0.49, w - 0.36, 0.22, {
      size: 9.8,
      color: idx === 1 ? "D8D8D2" : C.muted,
    });
  });
  arrow(slide, 4.18, 3.55, 4.86, 3.05);
  arrow(slide, 8.42, 3.05, 8.98, 3.55);
  arrow(slide, 6.65, 3.42, 6.65, 3.66);
  smallDot(slide, 1.0, 5.55, "Office artifacts are real DOCX, XLSX, and PPTX outputs.");
  smallDot(slide, 1.0, 5.98, "OpenClaw/Dedalus proof is visible in the UI and Photon runtime command.");
  footer(slide, "Technical map");
  qa(slide);
}

// 9
{
  const slide = pptx.addSlide();
  bg(slide);
  wordmark(slide);
  title(slide, "Why It Wins", "It is not a chatbot. It is a desk.", "The demo shows action, memory, artifacts, monitoring, and human supervision.");
  const reasons = [
    ["Real workflow", "research → PM → risk → desk → monitor"],
    ["Real artifacts", "memo, operating model, PM deck"],
    ["Real context", "filings, news, fundamentals, prices, transcripts"],
    ["Real guardrails", "paper-only, time-bounded, auditable"],
    ["Real surface", "web workbench plus iMessage PM feed"],
  ];
  reasons.forEach(([k, v], idx) => {
    const y = 2.64 + idx * 0.72;
    slide.addText(String(idx + 1).padStart(2, "0"), {
      x: 0.88,
      y,
      w: 0.5,
      h: 0.22,
      fontFace: FONT,
      fontSize: 14,
      bold: true,
      color: C.black,
      margin: 0,
    });
    body(slide, k, 1.55, y - 0.02, 2.3, 0.26, { size: 16, bold: true });
    body(slide, v, 4.2, y - 0.01, 6.6, 0.24, { size: 14, color: C.muted });
    slide.addShape(pptx.ShapeType.line, {
      x: 0.88,
      y: y + 0.44,
      w: 10.8,
      h: 0,
      line: { color: C.line, width: 0.7 },
    });
  });
  footer(slide, "Judge-facing close");
  qa(slide);
}

// 10
{
  const slide = pptx.addSlide();
  bg(slide, C.black);
  wordmark(slide, C.white);
  slide.addText("Citadail", {
    x: 0.76,
    y: 1.18,
    w: 4.2,
    h: 0.55,
    fontFace: FONT,
    fontSize: 36,
    bold: true,
    color: C.white,
    margin: 0,
  });
  body(slide, "An AI-native investment desk where coworkers turn market information into thesis, paper trade, and monitoring.", 0.78, 2.05, 8.9, 0.7, {
    size: 21,
    color: "E4E4DE",
    bold: true,
  });
  const steps = ["Sources", "Thesis", "Artifacts", "Paper Trade", "Watch"];
  steps.forEach((step, idx) => {
    const x = 0.85 + idx * 2.2;
    pill(slide, step, x, 4.95, 1.42, {
      fill: idx === 1 ? C.white : C.black,
      line: C.white,
      color: idx === 1 ? C.black : C.white,
      size: 8.8,
    });
    if (idx < steps.length - 1) arrow(slide, x + 1.45, 5.14, x + 2.04, 5.14, { color: C.white, width: 0.9 });
  });
  body(slide, "Demo line: one desk, multiple AI coworkers, paper-only execution, auditable decisions.", 0.85, 6.25, 10.9, 0.25, {
    size: 14,
    color: C.white,
    bold: true,
    align: "center",
  });
  footer(slide, "Close", true);
  qa(slide);
}

pptx.writeFile({ fileName: OUT });
