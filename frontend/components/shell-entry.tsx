"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import dedalusLogo from "../dedalus-logo.png";
import eragonLogo from "../eragonai_logo.jpeg";
import openclawLogo from "../openclaw-removebg-preview.png";
import photonLogo from "../photon.png";
import {
  createSessionId,
  queuePendingShellSessionSeed,
} from "@/lib/session-storage";

const loop = {
  duration: 12,
  ease: "easeInOut",
  repeat: Infinity,
} as const;

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const inputs = [
  { label: "Filings", x: 14, y: 18, rotate: -5 },
  { label: "Fundamentals", x: 63, y: 14, rotate: 4 },
  { label: "News", x: 25, y: 67, rotate: 5 },
  { label: "Price", x: 79, y: 62, rotate: -4 },
  { label: "Transcripts", x: 48, y: 78, rotate: 2 },
];

const outputs = [
  { label: "Memo", x: 21, y: 20, type: "doc" },
  { label: "Financial Model", x: 70, y: 20, type: "sheet" },
  { label: "Trade Desk", x: 20, y: 68, type: "desk" },
  { label: "PM Deck", x: 71, y: 68, type: "deck" },
];

export default function ShellEntry() {
  const router = useRouter();

  const startAssistMode = () => {
    const sessionId = createSessionId();
    queuePendingShellSessionSeed({
      id: sessionId,
      title: "Citadail",
    });
    router.push(`/sessions/${sessionId}`);
  };

  const startFullAutoMode = () => {
    router.push("/full-auto");
  };

  return (
    <main className="h-screen overflow-hidden bg-[#f6f8fb] text-[#0a2259]">
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-px bg-[#c6202d]"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: "left" }}
      />

      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1560px] flex-col px-5 py-5 sm:px-8 lg:px-10">
        <motion.header
          className="flex shrink-0 items-center border-b border-[#d9e0e8] pb-4"
          initial="hidden"
          animate="show"
          variants={fadeUp}
          transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
        >
          <Image
            src="/logo.png"
            alt="Citadail"
            width={176}
            height={99}
            priority
            className="h-11 w-auto object-contain"
          />
        </motion.header>

        <section className="grid min-h-0 flex-1 items-stretch gap-5 py-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <ProcessAnimation />

          <motion.div
            className="grid content-center gap-4"
            initial="hidden"
            animate="show"
            transition={{ staggerChildren: 0.1, delayChildren: 0.2 }}
          >
            <ModeButton
              dark
              label="Assist Mode"
              onClick={startAssistMode}
              title="Analyst directs the work."
            />
            <ModeButton
              label="Full Auto Mode"
              onClick={startFullAutoMode}
              title="System proposes the book."
            />
          </motion.div>
        </section>
      </div>
    </main>
  );
}

const ProcessAnimation = () => (
  <motion.div
    className="relative h-full min-h-0 overflow-hidden border border-[#d9e0e8] bg-white shadow-[0_24px_90px_rgba(6,21,43,0.08)]"
    initial={{ opacity: 0, y: 24 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
  >
    <GridField />

    <div className="absolute left-5 top-5 z-20 flex max-w-[calc(100%-2.5rem)] flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 border border-[#d9e0e8] bg-[#f8fafc] px-2 py-2">
        <Image
          src={eragonLogo}
          alt="Eragon"
          width={28}
          height={28}
          className="h-7 w-7 object-cover"
        />
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Agent Runtime
        </span>
      </div>
      <div className="flex items-center gap-2 border border-[#d9e0e8] bg-[#f8fafc] px-2 py-2">
        <Image
          src={dedalusLogo}
          alt="Dedalus"
          width={28}
          height={28}
          className="h-7 w-7 object-contain"
        />
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Machine Layer
        </span>
      </div>
      <div className="flex items-center gap-2 border border-[#d9e0e8] bg-[#f8fafc] px-2 py-2">
        <Image
          src={photonLogo}
          alt="Photon"
          width={28}
          height={28}
          className="h-7 w-7 object-cover"
        />
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Message Layer
        </span>
      </div>
    </div>

    <div className="absolute inset-0">
      {inputs.map((input, index) => (
        <ConvergenceTrace key={`${input.label}-trace`} input={input} index={index} />
      ))}

      {outputs.map((output, index) => (
        <FanoutTrace key={`${output.label}-trace`} index={index} output={output} />
      ))}

      {inputs.map((input, index) => (
        <InputFragment key={input.label} input={input} index={index} />
      ))}

      <ThesisRecord />
      <OpenClawRuntime />

      {outputs.map((output, index) => (
        <OutputArtifact key={output.label} index={index} output={output} />
      ))}

      <FinalTradeDesk />
      <PhotonMessenger />
    </div>
  </motion.div>
);

const ConvergenceTrace = ({
  index,
  input,
}: {
  index: number;
  input: (typeof inputs)[number];
}) => (
  <motion.span
    aria-hidden="true"
    className="absolute z-[5] h-2 w-2 bg-[#c6202d]"
    style={{ left: `${input.x}%`, top: `${input.y}%` }}
    animate={{
      left: [`${input.x}%`, `${input.x}%`, "50%", "50%", `${input.x}%`],
      opacity: [0, 0.8, 1, 0, 0],
      scale: [0.8, 1, 1.35, 0.5, 0.8],
      top: [`${input.y}%`, `${input.y}%`, "45%", "45%", `${input.y}%`],
    }}
    transition={{ ...loop, delay: index * 0.05, times: [0, 0.1, 0.28, 0.42, 1] }}
  />
);

const FanoutTrace = ({
  index,
  output,
}: {
  index: number;
  output: (typeof outputs)[number];
}) => (
  <motion.span
    aria-hidden="true"
    className="absolute z-[5] h-1.5 w-10 bg-[#0a2259]"
    style={{ left: "50%", top: "45%" }}
    animate={{
      left: ["50%", "50%", "50%", `${output.x}%`, `${output.x}%`, `${output.x}%`],
      opacity: [0, 0, 0.95, 0.85, 0, 0],
      rotate: [0, 0, index % 2 === 0 ? -12 : 12, 0, 0, 0],
      scaleX: [0.2, 0.2, 1.4, 0.7, 0.2, 0.2],
      top: ["45%", "45%", "45%", `${output.y}%`, `${output.y}%`, `${output.y}%`],
    }}
    transition={{ ...loop, delay: 0.04 + index * 0.035, times: [0, 0.31, 0.42, 0.58, 0.76, 1] }}
  />
);

const InputFragment = ({
  index,
  input,
}: {
  index: number;
  input: (typeof inputs)[number];
}) => (
  <motion.div
    className="absolute z-10 w-40 border border-[#d9e0e8] bg-white px-4 py-4 shadow-sm"
    style={{ left: `${input.x}%`, top: `${input.y}%`, translateX: "-50%", translateY: "-50%" }}
    animate={{
      left: [`${input.x}%`, `${input.x}%`, "50%", "50%", "50%", `${input.x}%`],
      opacity: [1, 1, 0.72, 0, 0, 1],
      rotate: [input.rotate, input.rotate * -0.8, 0, -8, -8, input.rotate],
      scale: [1, 1.06, 0.42, 0.18, 0.18, 1],
      top: [`${input.y}%`, `${input.y}%`, "45%", "45%", "45%", `${input.y}%`],
    }}
    transition={{ ...loop, delay: index * 0.04, times: [0, 0.12, 0.3, 0.42, 0.96, 1] }}
  >
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-semibold text-[#0a2259]">{input.label}</p>
      <span className="h-2 w-2 bg-[#c6202d]" />
    </div>
    <div className="mt-5 space-y-1.5">
      <div className="h-1.5 w-full bg-slate-200" />
      <div className="h-1.5 w-2/3 bg-slate-200" />
    </div>
  </motion.div>
);

const ThesisRecord = () => (
  <motion.div
    className="absolute z-20 w-[340px] border border-[#0a2259] bg-[#0a2259] p-6 text-white shadow-[0_22px_80px_rgba(6,21,43,0.2)]"
    style={{ left: "50%", top: "45%", translateX: "-50%", translateY: "-50%" }}
    animate={{
      opacity: [0, 0.2, 1, 1, 0, 0],
      scale: [0.42, 0.56, 1.08, 1, 0.72, 0.72],
      y: [22, 10, 0, 0, -8, -8],
    }}
    transition={{ ...loop, times: [0, 0.18, 0.3, 0.5, 0.62, 1] }}
  >
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
          Thesis Record
        </p>
        <p className="mt-5 text-5xl font-semibold leading-none">AAPL</p>
      </div>
      <div className="border border-white/16 px-3 py-2 text-right">
        <p className="text-xs text-white/50">7.8</p>
        <p className="mt-1 text-2xl font-semibold">BUY</p>
      </div>
    </div>

    <div className="mt-8 grid grid-cols-3 border border-white/14">
      {["Evidence", "Risk", "Triggers"].map((item) => (
        <div key={item} className="border-r border-white/14 px-3 py-4 last:border-r-0">
          <p className="text-xs font-semibold text-white/60">{item}</p>
        </div>
      ))}
    </div>
  </motion.div>
);

const OpenClawRuntime = () => (
  <motion.div
    className="absolute z-30 w-60 border border-[#d9e0e8] bg-white/95 px-3 py-3 shadow-[0_18px_60px_rgba(6,21,43,0.14)] backdrop-blur"
    style={{ left: "66%", top: "43%", translateX: "-50%", translateY: "-50%" }}
    animate={{
      opacity: [0, 0, 0.95, 1, 0.9, 0, 0],
      scale: [0.82, 0.82, 1.04, 1, 0.96, 0.84, 0.84],
      x: [16, 16, 0, 0, -8, -14, -14],
      y: [10, 10, 0, 0, -4, -8, -8],
    }}
    transition={{ ...loop, times: [0, 0.25, 0.32, 0.43, 0.52, 0.62, 1] }}
  >
    <div className="flex items-center gap-2">
      <Image
        src={openclawLogo}
        alt="OpenClaw"
        width={34}
        height={34}
        className="h-8 w-8 object-contain"
      />
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0a2259]">
          OpenClaw
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Agent Graph
        </p>
      </div>
    </div>
    <div className="mt-3 grid grid-cols-3 gap-1.5">
      {["Analyst", "PM", "Risk"].map((role, index) => (
        <motion.div
          key={role}
          className="border border-[#e1e6ee] bg-[#f8fafc] px-1.5 py-1 text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500"
          animate={{ opacity: [0.45, 1, 0.45] }}
          transition={{
            duration: 0.8,
            delay: index * 0.12,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        >
          {role}
        </motion.div>
      ))}
    </div>
    <motion.div
      className="mt-2 flex items-center justify-between border border-[#e1e6ee] bg-[#f8fafc] px-2 py-2"
      animate={{
        opacity: [0.6, 1, 0.6],
      }}
      transition={{
        duration: 1.2,
        ease: "easeInOut",
        repeat: Infinity,
      }}
    >
      <div className="flex items-center gap-2">
        <Image
          src={dedalusLogo}
          alt="Dedalus"
          width={24}
          height={24}
          className="h-6 w-6 object-contain"
        />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#0a2259]">
            Dedalus
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            Machine Host
          </p>
        </div>
      </div>
      <div className="grid gap-1">
        <motion.span
          className="block h-1.5 w-9 bg-[#0a2259]"
          animate={{ scaleX: [0.45, 1, 0.45] }}
          transition={{ duration: 1, ease: "easeInOut", repeat: Infinity }}
          style={{ transformOrigin: "left" }}
        />
        <motion.span
          className="block h-1.5 w-7 bg-[#c6202d]"
          animate={{ scaleX: [1, 0.45, 1] }}
          transition={{ duration: 1, ease: "easeInOut", repeat: Infinity }}
          style={{ transformOrigin: "left" }}
        />
      </div>
    </motion.div>
  </motion.div>
);

const OutputArtifact = ({
  index,
  output,
}: {
  index: number;
  output: (typeof outputs)[number];
}) => (
  <motion.div
    className="absolute z-10 w-48 border border-[#d9e0e8] bg-white p-4 shadow-sm"
    style={{ left: `${output.x}%`, top: `${output.y}%`, translateX: "-50%", translateY: "-50%" }}
    animate={{
      left: ["50%", "50%", "50%", `${output.x}%`, `${output.x}%`, `${output.x}%`, `${output.x}%`],
      opacity: [0, 0, 0.35, 1, 1, 0, 0],
      rotate: [0, 0, index % 2 === 0 ? -4 : 4, 0, 0, 0, 0],
      scale: [0.42, 0.42, 0.66, 1.03, 1, 0.82, 0.82],
      top: ["45%", "45%", "45%", `${output.y}%`, `${output.y}%`, `${output.y}%`, `${output.y}%`],
    }}
    transition={{ ...loop, delay: 0.04 + index * 0.035, times: [0, 0.3, 0.4, 0.52, 0.68, 0.78, 1] }}
  >
    <div className="flex items-start justify-between gap-3">
      <p className="text-xl font-semibold text-[#0a2259]">{output.label}</p>
      {output.type === "chart" ? <MiniChartIcon /> : <MiniDocIcon type={output.type} />}
    </div>
    <ArtifactPreview type={output.type} />
  </motion.div>
);

const FinalTradeDesk = () => (
  <motion.div
    className="absolute z-30 w-[520px] max-w-[74%] border border-[#0a2259] bg-white shadow-[0_24px_90px_rgba(6,21,43,0.18)]"
    style={{ left: "50%", top: "52%", translateX: "-50%", translateY: "-50%" }}
    animate={{
      opacity: [0, 0, 0.2, 1, 1, 1, 0],
      scale: [0.78, 0.78, 0.92, 1, 1, 1, 0.9],
      y: [34, 34, 12, 0, 0, 0, 20],
    }}
    transition={{ ...loop, times: [0, 0.64, 0.7, 0.76, 0.9, 0.985, 1] }}
  >
    <div className="border-b border-[#d9e0e8] bg-[#0a2259] px-4 py-3 text-white">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
          Trade Desk
        </p>
        <p className="text-sm font-semibold text-emerald-300">Book Equity</p>
      </div>
    </div>
    <div className="p-4">
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-2">
          <PositionRow delay={0} pnl="+$24,680" returnPct="+4.7%" ticker="AAPL" tone="positive" />
          <PositionRow delay={0.12} pnl="+$18,240" returnPct="+3.9%" ticker="NVDA" tone="positive" />
          <PositionRow delay={0.24} pnl="-$4,120" returnPct="-1.1%" ticker="MSFT" tone="negative" />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {["Add", "Trim", "Exit"].map((action) => (
              <motion.div
                key={action}
                className="border border-[#e1e6ee] px-2 py-2 text-center text-xs font-semibold text-slate-500"
                animate={{ opacity: [0, 0, 0, 1, 1, 0] }}
                transition={{ ...loop, delay: 0.24, times: [0, 0.62, 0.7, 0.78, 0.985, 1] }}
              >
                {action}
              </motion.div>
            ))}
          </div>
        </div>
        <div className="h-48 border border-[#e1e6ee] p-3">
          <svg viewBox="0 0 320 150" className="h-full w-full">
            {[34, 72, 110].map((y) => (
              <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            ))}
            <motion.path
              d="M4 118 L42 116 L78 116 L112 104 L148 109 L186 84 L224 91 L266 62 L316 44"
              fill="none"
              stroke="#047857"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: [0, 0, 0, 1, 1, 0] }}
              transition={{ ...loop, times: [0, 0.64, 0.72, 0.82, 0.985, 1] }}
            />
            <motion.circle
              cx="316"
              cy="44"
              r="6"
              fill="#047857"
              animate={{ opacity: [0, 0, 0, 1, 1, 0], scale: [0.5, 0.5, 0.5, 1, 1.2, 0.5] }}
              transition={{ ...loop, times: [0, 0.74, 0.82, 0.87, 0.985, 1] }}
            />
          </svg>
        </div>
      </div>
    </div>
  </motion.div>
);

const photonMessages = [
  {
    align: "left",
    kind: "text",
    label: "Citadail",
    text: "PM approved AAPL. Risk accepted 5% paper size.",
  },
  {
    align: "left",
    kind: "text",
    text: "Trade Desk opened paper long @ $189.98.",
  },
  {
    align: "left",
    kind: "chart",
    label: "Book equity",
  },
  {
    align: "left",
    kind: "text",
    text: "Monitor is live. Earnings check queued.",
  },
] as const;

const PhotonMessenger = () => (
  <motion.div
    className="absolute z-40 w-[252px] max-w-[34%]"
    style={{ left: "74%", top: "50%", translateX: "-50%", translateY: "-50%" }}
    animate={{
      opacity: [0, 0, 0, 0.36, 1, 1, 0],
      scale: [0.82, 0.82, 0.82, 0.92, 1, 1, 0.92],
      x: [46, 46, 46, 20, 0, 0, 18],
      y: [16, 16, 16, 4, 0, 0, 10],
    }}
    transition={{ ...loop, times: [0, 0.82, 0.855, 0.89, 0.925, 0.994, 1] }}
  >
    <motion.div
      className="mb-2 ml-auto flex w-fit items-center gap-2 border border-[#d9e0e8] bg-white/90 px-2 py-1 shadow-sm backdrop-blur"
      animate={{
        opacity: [0, 0, 0, 0.4, 1, 1, 0],
        y: [8, 8, 8, 4, 0, 0, -6],
      }}
      transition={{ ...loop, times: [0, 0.84, 0.875, 0.905, 0.93, 0.994, 1] }}
    >
      <Image
        src={photonLogo}
        alt="Photon"
        width={18}
        height={18}
        className="h-4.5 w-4.5 rounded object-cover"
      />
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        Photon
      </span>
    </motion.div>

    <div className="relative">
      <span className="absolute -left-1 top-20 h-9 w-1 rounded-l-full bg-[#07163a]" />
      <span className="absolute -left-1 top-32 h-12 w-1 rounded-l-full bg-[#07163a]" />
      <span className="absolute -right-1 top-28 h-16 w-1 rounded-r-full bg-[#07163a]" />
      <div className="rounded-[42px] border-[7px] border-[#07163a] bg-[#07163a] p-[3px] shadow-[0_26px_90px_rgba(6,21,43,0.28)]">
        <div className="relative aspect-[9/19.5] overflow-hidden rounded-[33px] bg-[#f3f4f8]">
          <div className="absolute left-1/2 top-2 z-30 h-7 w-[86px] -translate-x-1/2 rounded-full bg-[#050914] shadow-sm" />
          <div className="flex h-full flex-col">
            <div className="relative z-20 bg-[#fbfbfd]/95 px-4 pb-2 pt-3 backdrop-blur">
              <div className="flex items-center justify-between text-[10px] font-semibold text-[#0a2259]">
                <span>9:41</span>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-3.5 rounded-[3px] border border-[#0a2259]/70">
                    <span className="ml-[2px] mt-[2px] block h-1.5 w-2 rounded-sm bg-[#0a2259]" />
                  </span>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none text-[#007aff]">‹</span>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#0a2259] text-[10px] font-semibold text-white">
                    PM
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-[#0a2259]">PM Group</p>
                    <p className="text-[9px] font-medium text-slate-400">
                      Citadail via Spectrum
                    </p>
                  </div>
                </div>
                <Image
                  src={photonLogo}
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5 rounded object-cover"
                />
              </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden px-3 pb-12 pt-3">
              <div className="space-y-2">
                {photonMessages.map((message, index) => (
                  <MessageBubble
                    key={"text" in message ? message.text : "chart-card"}
                    align={message.align}
                    index={index}
                    kind={message.kind}
                    label={"label" in message ? message.label : undefined}
                    text={"text" in message ? message.text : undefined}
                  />
                ))}
              </div>

              <motion.div
                className="absolute bottom-5 left-3 right-3 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm"
                animate={{ opacity: [0, 0, 0, 0.75, 1, 1, 0] }}
                transition={{ ...loop, times: [0, 0.88, 0.91, 0.94, 0.97, 0.994, 1] }}
              >
                <div className="h-2 w-24 rounded-full bg-slate-200" />
              </motion.div>
              <div className="absolute bottom-1 left-1/2 h-1 w-24 -translate-x-1/2 rounded-full bg-[#07163a]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </motion.div>
);

const MessageBubble = ({
  align,
  index,
  kind,
  label,
  text,
}: {
  align: "left" | "right";
  index: number;
  kind?: "text" | "chart";
  label?: string;
  text?: string;
}) => {
  const start = index === 0 ? 0.928 : 0.946 + (index - 1) * 0.015;
  const settle = Math.min(start + (index === 0 ? 0.04 : 0.03), 0.986);
  const blurOut = 0.994;
  const isChart = kind === "chart";

  return (
    <motion.div
      className={
        align === "right"
          ? "ml-auto mr-1 max-w-[82%]"
          : isChart
            ? "ml-1 mr-auto max-w-[92%]"
            : "ml-1 mr-auto max-w-[86%]"
      }
      animate={{
        filter:
          index <= 1
            ? ["blur(2px)", "blur(2px)", "blur(0px)", "blur(0px)", "blur(2px)"]
            : ["blur(7px)", "blur(5px)", "blur(0px)", "blur(1px)", "blur(7px)"],
        opacity: [0, 0, 1, 1, 0],
        scale: index === 0 ? [0.82, 0.82, 1.04, 1, 0.94] : [0.72, 0.72, 1.02, 1, 0.9],
        x:
          align === "right"
            ? [26 + index * 5, 26 + index * 5, 0, 0, -10]
            : [-18 - index * 3, -18 - index * 3, 0, 0, 10],
        y: [16 + index * 4, 16 + index * 4, 0, -index * 2, -10],
      }}
      transition={{ ...loop, times: [0, start, settle, blurOut, 1] }}
    >
      {label ? (
        <p className="mb-0.5 ml-2 text-[9px] font-semibold text-slate-400">
          {label}
        </p>
      ) : null}
      <div
        className={
          align === "right"
            ? "relative rounded-[18px] rounded-br-[5px] bg-[#007aff] px-3 py-2 text-right text-[11px] font-semibold leading-4 text-white shadow-sm after:absolute after:-right-0.5 after:bottom-0 after:h-3 after:w-3 after:rounded-bl-xl after:bg-[#007aff]"
            : "relative rounded-[18px] rounded-bl-[5px] bg-white px-3 py-2 text-[11px] font-semibold leading-4 text-[#0a2259] shadow-sm ring-1 ring-slate-200 after:absolute after:-left-0.5 after:bottom-0 after:h-3 after:w-3 after:rounded-br-xl after:bg-white"
        }
      >
        {isChart ? <IMessageChartCard /> : text}
      </div>
    </motion.div>
  );
};

const IMessageChartCard = () => (
  <div className="w-[162px]">
    <div className="flex items-center justify-between">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        Book Equity
      </p>
      <p className="text-[10px] font-semibold text-emerald-700">+4.7%</p>
    </div>
    <svg viewBox="0 0 170 72" className="mt-2 h-16 w-full">
      {[18, 36, 54].map((y) => (
        <line key={y} x1="0" x2="170" y1={y} y2={y} stroke="#e2e8f0" strokeWidth="1" />
      ))}
      <path
        d="M3 58 L26 55 L48 56 L70 45 L92 48 L112 32 L132 36 L153 18 L167 14"
        fill="none"
        stroke="#047857"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      />
      <circle cx="167" cy="14" r="4" fill="#047857" />
    </svg>
    <div className="mt-1 grid grid-cols-3 gap-1 text-[9px] font-semibold text-slate-400">
      <span>AAPL</span>
      <span>NVDA</span>
      <span>MSFT</span>
    </div>
  </div>
);

const PositionRow = ({
  delay,
  pnl,
  returnPct,
  ticker,
  tone,
}: {
  delay: number;
  pnl: string;
  returnPct: string;
  ticker: string;
  tone: "positive" | "negative";
}) => (
  <motion.div
    className="grid grid-cols-[56px_1fr_auto] items-center gap-3 border border-[#e1e6ee] px-3 py-3"
    animate={{ opacity: [0, 0, 0, 1, 1, 0], x: [-12, -12, -12, 0, 0, 10] }}
    transition={{ ...loop, delay, times: [0, 0.62, 0.7, 0.78, 0.985, 1] }}
  >
    <p className="font-mono text-sm font-semibold text-[#0a2259]">{ticker}</p>
    <div className="h-2 overflow-hidden bg-slate-100">
      <motion.div
        className={tone === "positive" ? "h-full bg-emerald-600" : "h-full bg-red-600"}
        animate={{ width: ["0%", "0%", "0%", tone === "positive" ? "78%" : "34%", tone === "positive" ? "78%" : "34%", "0%"] }}
        transition={{ ...loop, delay, times: [0, 0.62, 0.7, 0.8, 0.985, 1] }}
      />
    </div>
    <div className="relative min-w-20 text-right text-sm font-semibold">
      <motion.span
        className="absolute inset-0 text-slate-400"
        animate={{ opacity: [0, 0, 0, 1, 0, 0] }}
        transition={{ ...loop, delay, times: [0, 0.62, 0.7, 0.74, 0.82, 1] }}
      >
        $0
      </motion.span>
      <motion.span
        className={tone === "positive" ? "text-emerald-700" : "text-red-700"}
        animate={{ opacity: [0, 0, 0, 0, 1, 0], y: [6, 6, 6, 6, 0, -4] }}
        transition={{ ...loop, delay, times: [0, 0.68, 0.76, 0.82, 0.88, 1] }}
      >
        {pnl} <span className="text-xs font-normal">{returnPct}</span>
      </motion.span>
    </div>
  </motion.div>
);

const ModeButton = ({
  dark,
  label,
  onClick,
  title,
}: {
  dark?: boolean;
  label: string;
  onClick: () => void;
  title: string;
}) => (
  <motion.button
    type="button"
    onClick={onClick}
    className={
      dark
        ? "group min-h-56 border border-[#0a2259] bg-[#0a2259] p-6 text-left text-white transition-colors hover:bg-[#0a2259] focus:outline-none focus:ring-2 focus:ring-[#c6202d] focus:ring-offset-2 focus:ring-offset-[#f6f8fb]"
        : "group min-h-56 border border-[#d9e0e8] bg-white p-6 text-left text-[#0a2259] shadow-[0_20px_70px_rgba(6,21,43,0.06)] transition-colors hover:border-[#0a2259] hover:bg-[#fbfcfe] focus:outline-none focus:ring-2 focus:ring-[#c6202d] focus:ring-offset-2 focus:ring-offset-[#f6f8fb]"
    }
    initial="hidden"
    animate={{
      opacity: 1,
      y: 0,
    }}
    variants={fadeUp}
    transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
    whileHover={{ y: -3 }}
    whileTap={{ y: 0 }}
  >
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span>{label}</span>
        <span className={dark ? "text-[#ff6b75]" : "text-[#c6202d]"}>
          Open
        </span>
      </div>
      <div>
        <div
          className={
            dark
              ? "text-4xl font-semibold leading-tight text-white"
              : "text-4xl font-semibold leading-tight text-[#3f4f66]"
          }
        >
          {title}
        </div>
        <div className={dark ? "mt-5 h-px w-full bg-white/16" : "mt-5 h-px w-full bg-[#d9e0e8]"} />
      </div>
    </div>
  </motion.button>
);

const GridField = () => (
  <div aria-hidden="true" className="absolute inset-0">
    {Array.from({ length: 12 }, (_, index) => (
      <motion.div
        key={`row-${index}`}
        className="absolute left-0 right-0 h-px bg-[#edf1f6]"
        style={{ top: `${10 + index * 7}%` }}
        animate={{ opacity: [0.25, 0.85, 0.25], x: [0, 8, 0] }}
        transition={{ ...loop, delay: index * 0.05 }}
      />
    ))}
    {Array.from({ length: 8 }, (_, index) => (
      <div
        key={`col-${index}`}
        className="absolute bottom-0 top-0 w-px bg-[#f0f3f7]"
        style={{ left: `${12 + index * 11}%` }}
      />
    ))}
  </div>
);

const ArtifactPreview = ({ type }: { type: string }) => {
  if (type === "sheet") {
    return (
      <div className="mt-6 grid grid-cols-4 border border-[#e1e6ee]">
        {Array.from({ length: 12 }, (_, index) => (
          <div
            key={index}
            className="h-4 border-b border-r border-[#edf1f6] last:border-r-0"
          />
        ))}
      </div>
    );
  }

  if (type === "chart") {
    return (
      <div className="mt-6 h-12 border border-[#e1e6ee] p-2">
        <svg viewBox="0 0 150 35" className="h-full w-full">
          <path
            d="M0 27 L30 24 L54 26 L82 17 L112 19 L150 8"
            fill="none"
            stroke="#047857"
            strokeLinecap="round"
            strokeWidth="3"
          />
        </svg>
      </div>
    );
  }

  if (type === "desk") {
    return (
      <div className="mt-6 grid grid-cols-2 gap-2">
        <div className="border border-[#e1e6ee] p-2 text-xs font-semibold text-slate-500">
          Hold
        </div>
        <div className="border border-[#e1e6ee] p-2 text-xs font-semibold text-slate-500">
          Add
        </div>
      </div>
    );
  }

  if (type === "deck") {
    return (
      <div className="mt-6 grid grid-cols-3 gap-2">
        {["Thesis", "Model", "Risk"].map((slide) => (
          <div key={slide} className="h-12 border border-[#e1e6ee] bg-[#f8fafc] p-1.5">
            <div className="h-1 w-7 bg-[#0a2259]" />
            <div className="mt-2 h-1 w-full bg-slate-200" />
            <div className="mt-1 h-1 w-2/3 bg-slate-200" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-2">
      <div className="h-1.5 w-full bg-slate-200" />
      <div className="h-1.5 w-4/5 bg-slate-200" />
      <div className="h-1.5 w-11/12 bg-slate-200" />
    </div>
  );
};

const MiniDocIcon = ({ type }: { type: string }) => (
  <div className="h-7 w-7 border border-[#d9e0e8] bg-[#f8fafc] p-1">
    {type === "deck" ? (
      <div className="grid h-full grid-cols-2 gap-0.5">
        <div className="border border-[#0a2259]" />
        <div className="border border-slate-300" />
        <div className="col-span-2 h-1 bg-[#0a2259]" />
      </div>
    ) : (
      <>
        <div className="h-1.5 w-full bg-[#0a2259]" />
        <div className="mt-1.5 h-px w-full bg-slate-300" />
        <div className="mt-1 h-px w-2/3 bg-slate-300" />
        {type === "sheet" ? <div className="mt-1 h-px w-1/2 bg-slate-300" /> : null}
      </>
    )}
  </div>
);

const MiniChartIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 28 28"
    className="h-7 w-7 border border-[#d9e0e8] bg-[#f8fafc] p-1"
  >
    <path
      d="M3 20 L9 16 L14 18 L20 9 L25 7"
      fill="none"
      stroke="#0a2259"
      strokeLinecap="round"
      strokeWidth="2"
    />
  </svg>
);
