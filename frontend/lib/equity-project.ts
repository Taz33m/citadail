import type {
  EquityCompsRow,
  EquityDeckSlide,
  EquityEvidenceItem,
  EquityForecastRow,
  EquityMemoSection,
  EquityModelAssumption,
  EquityProject,
  EquityProjectArtifact,
  EquityProjectArtifactType,
  EquityProjectGeneratedContent,
  EquityRiskTrigger,
  EquitySensitivityRow,
  EquityTradeProposal,
  EquityValuationOutput,
  ThesisDraft,
  ThesisRecommendation,
} from "@/types/session";

export const EQUITY_PROJECT_ARTIFACT_TYPES = [
  "memo_docx",
  "operating_model_xlsx",
  "pm_deck_pptx",
] as const satisfies EquityProjectArtifactType[];

export const MIME_TYPES: Record<EquityProjectArtifactType, string> = {
  memo_docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  operating_model_xlsx:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pm_deck_pptx:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const ARTIFACT_TITLES: Record<EquityProjectArtifactType, string> = {
  memo_docx: "Memo",
  operating_model_xlsx: "Model",
  pm_deck_pptx: "Deck",
};

const ARTIFACT_EXTENSIONS: Record<EquityProjectArtifactType, string> = {
  memo_docx: "docx",
  operating_model_xlsx: "xlsx",
  pm_deck_pptx: "pptx",
};

export interface EquityCompanyContext {
  companyName?: string;
  sector?: string;
  summary?: string;
  lastCheck?: string;
  status?: string;
}

export interface EquityProjectGenerateInput {
  ticker: string;
  recommendation: ThesisRecommendation;
  rationale: string;
  companyContext?: EquityCompanyContext | null;
}

const RECOMMENDATION_LABELS: Record<ThesisRecommendation, string> = {
  "buy-long": "Buy / Long",
  "hold-neutral": "Hold / Neutral",
  "sell-short": "Sell / Short",
};

export const formatThesisRecommendation = (
  recommendation: ThesisRecommendation,
) => RECOMMENDATION_LABELS[recommendation];

export const isEquityProjectArtifactType = (
  value: unknown,
): value is EquityProjectArtifactType =>
  EQUITY_PROJECT_ARTIFACT_TYPES.includes(value as EquityProjectArtifactType);

export const sanitizeTicker = (ticker: string) =>
  ticker.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);

export const sanitizeFilenamePart = (value: string) =>
  value
    .trim()
    .replace(/[^\w\-. ]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);

const NON_SUBSTANTIVE_LEAD_RE =
  /^(?:(?:initial analyst rationale|user rationale)\s*:\s*)?(?:hi|hello|hey|yo|test|testing|thanks|thank you)\b[.!,:;\s-]*/i;

export const stripNonSubstantiveLead = (value: string): string => {
  let cleaned = value.replace(/\s+/g, " ").trim();
  const recommendationPrefix = cleaned.match(
    /^(buy\s*\/\s*long|hold\s*\/\s*neutral|sell\s*\/\s*short)\.?\s*/i,
  )?.[0];

  if (recommendationPrefix) {
    const tail = stripNonSubstantiveLead(
      cleaned.slice(recommendationPrefix.length),
    );
    return `${recommendationPrefix.trim()} ${tail}`.trim();
  }

  let previous = "";
  while (previous !== cleaned) {
    previous = cleaned;
    cleaned = cleaned.replace(NON_SUBSTANTIVE_LEAD_RE, "").trim();
  }

  return cleaned;
};

export const normalizeAnalystRationale = (value: string) => {
  const cleaned = stripNonSubstantiveLead(value)
    .replace(
      /^(buy\s*\/\s*long|hold\s*\/\s*neutral|sell\s*\/\s*short)\s*[:.-]?\s*/i,
      "",
    )
    .trim();

  if (!cleaned || /^(hi|hello|hey|yo|test|testing|thanks|thank you)$/i.test(cleaned)) {
    return null;
  }

  const hasInvestmentLanguage =
    /\b(revenue|margin|growth|fcf|cash|valuation|multiple|catalyst|guidance|earnings|services|demand|risk|thesis|share|market|consensus|segment|price)\b/i.test(
      cleaned,
    );
  if (cleaned.length < 24 && !hasInvestmentLanguage) return null;

  return cleaned;
};

const buildFilename = (
  ticker: string,
  artifactType: EquityProjectArtifactType,
) =>
  `${sanitizeFilenamePart(ticker || "Ticker")}_${ARTIFACT_TITLES[
    artifactType
  ].replace(/\s+/g, "_")}.${ARTIFACT_EXTENSIONS[artifactType]}`;

export const buildPendingArtifacts = (
  ticker: string,
): Record<EquityProjectArtifactType, EquityProjectArtifact> => ({
  memo_docx: {
    type: "memo_docx",
    title: "Memo",
    status: "generating",
    filename: buildFilename(ticker, "memo_docx"),
    mimeType: MIME_TYPES.memo_docx,
    preview: "Investment memo is being drafted.",
    error: null,
  },
  operating_model_xlsx: {
    type: "operating_model_xlsx",
    title: "Model",
    status: "generating",
    filename: buildFilename(ticker, "operating_model_xlsx"),
    mimeType: MIME_TYPES.operating_model_xlsx,
    preview: "Operating model workbook is being built.",
    error: null,
  },
  pm_deck_pptx: {
    type: "pm_deck_pptx",
    title: "Deck",
    status: "generating",
    filename: buildFilename(ticker, "pm_deck_pptx"),
    mimeType: MIME_TYPES.pm_deck_pptx,
    preview: "PM pitch deck is being assembled.",
    error: null,
  },
});

export const createPendingEquityProject = (
  draft: ThesisDraft,
): EquityProject => {
  const ticker = sanitizeTicker(draft.ticker);
  if (!ticker) throw new Error("Ticker is required.");
  if (!draft.recommendation) throw new Error("Recommendation is required.");

  const now = new Date().toISOString();
  return {
    id: `equity-project-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    ticker,
    recommendation: draft.recommendation,
    rationale: draft.rationale.trim(),
    status: "generating",
    createdAt: now,
    updatedAt: now,
    artifacts: buildPendingArtifacts(ticker),
    generatedContent: null,
    error: null,
  };
};

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,%x,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const requireString = (
  record: Record<string, unknown>,
  key: string,
): string => {
  const value = asString(record[key]);
  if (!value) throw new Error(`Generated project missing ${key}.`);
  return value;
};

const normalizeStringArray = (
  value: unknown,
  key: string,
  minItems = 1,
): string[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Generated project missing ${key}.`);
  }

  const items = value.flatMap((item) => {
    const normalized = asString(item);
    return normalized ? [normalized] : [];
  });

  if (items.length < minItems) {
    throw new Error(`Generated project ${key} needs at least ${minItems} item.`);
  }

  return items;
};

const joinStringArray = (value: unknown): string | null => {
  if (!Array.isArray(value)) return null;
  const items = value.flatMap((item) => {
    const normalized = asString(item);
    return normalized ? [normalized] : [];
  });
  return items.length ? items.join("\n") : null;
};

const buildFallbackMemoSections = (
  record: Record<string, unknown>,
): EquityMemoSection[] => {
  const bullBaseBear = [
    asString(record.bullCase) ? `Bull: ${asString(record.bullCase)}` : null,
    asString(record.baseCase) ? `Base: ${asString(record.baseCase)}` : null,
    asString(record.bearCase) ? `Bear: ${asString(record.bearCase)}` : null,
  ].flatMap((item) => (item ? [item] : []));

  const candidates: Array<[string, string | null]> = [
    ["What the Company Is", asString(record.companyOverview)],
    ["Recommendation / Bias", asString(record.recommendationSummary)],
    ["Why Now", asString(record.whyNow)],
    ["What Changed", asString(record.whatChanged)],
    [
      "Variant Perception / Edge",
      [
        asString(record.variantPerception),
        asString(record.marketMissing)
          ? `Consensus likely believes: ${asString(record.marketMissing)}`
          : null,
      ]
        .flatMap((item) => (item ? [item] : []))
        .join("\n\n") || null,
    ],
    ["Bull / Base / Bear", bullBaseBear.join("\n") || null],
    ["Catalysts", joinStringArray(record.catalysts)],
    ["Risks", joinStringArray(record.risks)],
    ["Invalidation Conditions", joinStringArray(record.invalidationConditions)],
  ];

  return candidates.flatMap(([heading, body]) =>
    body ? [{ heading, body }] : [],
  );
};

const normalizeMemoSections = (
  value: unknown,
  record: Record<string, unknown>,
): EquityMemoSection[] => {
  if (!Array.isArray(value)) throw new Error("Generated project missing memoSections.");
  const sections = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const heading = asString(record.heading);
    const body = asString(record.body);
    return heading && body ? [{ heading, body }] : [];
  });
  const seenHeadings = new Set(
    sections.map((section) => section.heading.trim().toLowerCase()),
  );
  const repairedSections = [...sections];
  for (const fallback of buildFallbackMemoSections(record)) {
    const key = fallback.heading.trim().toLowerCase();
    if (!seenHeadings.has(key)) {
      repairedSections.push(fallback);
      seenHeadings.add(key);
    }
    if (repairedSections.length >= 5) break;
  }

  if (repairedSections.length < 5) {
    throw new Error("Generated memo needs at least five sections.");
  }
  return repairedSections;
};

const normalizeEvidence = (
  value: unknown,
  record: Record<string, unknown>,
): EquityEvidenceItem[] => {
  const rows = Array.isArray(value)
    ? value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const evidenceRecord = item as Record<string, unknown>;
        const label = asString(evidenceRecord.label);
        const evidenceValue = asString(evidenceRecord.value);
        const source = asString(evidenceRecord.source);
        const implication = asString(evidenceRecord.implication);
        return label && evidenceValue && source && implication
          ? [{ label, value: evidenceValue, source, implication }]
          : [];
      })
    : [];

  if (rows.length >= 3) return rows;

  const fallbackRows = normalizeAssumptions(record.modelAssumptions).map(
    (assumption) => ({
      label: assumption.label,
      value: assumption.value,
      source: assumption.source,
      implication: "Supports the model baseline and thesis underwriting.",
    }),
  );
  if (fallbackRows.length >= 3) return fallbackRows;
  throw new Error("Generated evidence needs at least three rows.");
};

const normalizeAssumptions = (value: unknown): EquityModelAssumption[] => {
  if (!Array.isArray(value)) throw new Error("Generated project missing modelAssumptions.");
  const rows = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = asString(record.label);
    const modelValue = asString(record.value);
    const source = asString(record.source);
    return label && modelValue && source
      ? [{ label, value: modelValue, source }]
      : [];
  });
  if (rows.length < 4) throw new Error("Generated model needs at least four assumptions.");
  return rows;
};

const normalizeForecast = (value: unknown): EquityForecastRow[] => {
  if (!Array.isArray(value)) throw new Error("Generated project missing forecast.");
  const rows = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const year = asString(record.year);
    const revenue = asNumber(record.revenue);
    const revenueGrowth = asNumber(record.revenueGrowth);
    const grossMargin = asNumber(record.grossMargin);
    const operatingMargin = asNumber(record.operatingMargin);
    const freeCashFlowMargin = asNumber(record.freeCashFlowMargin);
    if (
      !year ||
      revenue === null ||
      revenueGrowth === null ||
      grossMargin === null ||
      operatingMargin === null ||
      freeCashFlowMargin === null
    ) {
      return [];
    }
    return [
      {
        year,
        revenue,
        revenueGrowth,
        grossMargin,
        operatingMargin,
        freeCashFlowMargin,
      },
    ];
  });
  if (rows.length < 4) throw new Error("Generated model needs at least four forecast years.");
  return rows;
};

const normalizeValuation = (value: unknown): EquityValuationOutput[] => {
  if (!Array.isArray(value)) throw new Error("Generated project missing valuation.");
  const rows = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const metric = asString(record.metric);
    const modelValue = asString(record.value);
    const source = asString(record.source);
    return metric && modelValue && source
      ? [{ metric, value: modelValue, source }]
      : [];
  });
  if (rows.length < 3) throw new Error("Generated valuation needs at least three rows.");
  return rows;
};

const normalizeSensitivity = (value: unknown): EquitySensitivityRow[] => {
  if (!Array.isArray(value)) throw new Error("Generated project missing sensitivity.");
  const rows = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const caseLabel = asString(record.case);
    const revenueGrowth = asNumber(record.revenueGrowth);
    const operatingMargin = asNumber(record.operatingMargin);
    const impliedValue = asNumber(record.impliedValue);
    return caseLabel &&
      revenueGrowth !== null &&
      operatingMargin !== null &&
      impliedValue !== null
      ? [
          {
            case: caseLabel,
            revenueGrowth,
            operatingMargin,
            impliedValue,
          },
        ]
      : [];
  });
  if (rows.length < 3) throw new Error("Generated sensitivity needs at least three cases.");
  return rows;
};

const normalizeComps = (value: unknown): EquityCompsRow[] => {
  if (!Array.isArray(value)) throw new Error("Generated project missing comps.");
  const rows = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const ticker = asString(record.ticker);
    const company = asString(record.company);
    const evRevenue = asNumber(record.evRevenue);
    const evEbitda = asNumber(record.evEbitda);
    const pe = asNumber(record.pe);
    const rationale = asString(record.rationale);
    return ticker &&
      company &&
      evRevenue !== null &&
      evEbitda !== null &&
      pe !== null &&
      rationale
      ? [{ ticker, company, evRevenue, evEbitda, pe, rationale }]
      : [];
  });
  if (rows.length < 3) throw new Error("Generated comps need at least three peers.");
  return rows;
};

const normalizeRiskTriggers = (value: unknown): EquityRiskTrigger[] => {
  if (!Array.isArray(value)) throw new Error("Generated project missing riskTriggers.");
  const rows = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const trigger = asString(record.trigger);
    const threshold = asString(record.threshold);
    const action = asString(record.action);
    return trigger && threshold && action ? [{ trigger, threshold, action }] : [];
  });
  if (rows.length < 3) throw new Error("Generated risk triggers need at least three rows.");
  return rows;
};

const normalizeTradeProposal = (value: unknown): EquityTradeProposal => {
  if (!value || typeof value !== "object") {
    throw new Error("Generated project missing tradeProposal.");
  }
  const record = value as Record<string, unknown>;
  return {
    bias: requireString(record, "bias"),
    entryZone: requireString(record, "entryZone"),
    positionSize: requireString(record, "positionSize"),
    timeHorizon: requireString(record, "timeHorizon"),
    addTrimExit: requireString(record, "addTrimExit"),
  };
};

const normalizeDeckSlides = (value: unknown): EquityDeckSlide[] => {
  if (!Array.isArray(value)) throw new Error("Generated project missing deckSlides.");
  const slides = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = asString(record.title);
    const bullets = Array.isArray(record.bullets)
      ? record.bullets.flatMap((bullet) => {
          const normalized = asString(bullet);
          return normalized ? [normalized] : [];
        })
      : [];
    const speakerNotes = asString(record.speakerNotes) ?? "";
    return title && bullets.length ? [{ title, bullets, speakerNotes }] : [];
  });
  if (slides.length < 6) throw new Error("Generated deck needs at least six slides.");
  return slides;
};

export const normalizeGeneratedContent = (
  value: unknown,
): EquityProjectGeneratedContent => {
  if (!value || typeof value !== "object") {
    throw new Error("Generated project content is empty.");
  }

  const record = value as Record<string, unknown>;
  return {
    companyOverview: requireString(record, "companyOverview"),
    recommendationSummary: requireString(record, "recommendationSummary"),
    whyNow: requireString(record, "whyNow"),
    whatChanged: requireString(record, "whatChanged"),
    marketMissing: requireString(record, "marketMissing"),
    variantPerception: requireString(record, "variantPerception"),
    bullCase: requireString(record, "bullCase"),
    baseCase: requireString(record, "baseCase"),
    bearCase: requireString(record, "bearCase"),
    catalysts: normalizeStringArray(record.catalysts, "catalysts", 3),
    risks: normalizeStringArray(record.risks, "risks", 3),
    invalidationConditions: normalizeStringArray(
      record.invalidationConditions,
      "invalidationConditions",
      3,
    ),
    memoSections: normalizeMemoSections(record.memoSections, record),
    evidence: normalizeEvidence(record.evidence, record),
    modelAssumptions: normalizeAssumptions(record.modelAssumptions),
    forecast: normalizeForecast(record.forecast),
    valuation: normalizeValuation(record.valuation),
    sensitivity: normalizeSensitivity(record.sensitivity),
    comps: normalizeComps(record.comps),
    riskTriggers: normalizeRiskTriggers(record.riskTriggers),
    tradeProposal: normalizeTradeProposal(record.tradeProposal),
    deckSlides: normalizeDeckSlides(record.deckSlides),
  };
};

export const buildArtifactPreviews = (
  content: EquityProjectGeneratedContent,
) => ({
  memo_docx: [
    content.recommendationSummary,
    `Why now: ${content.whyNow}`,
    `Variant perception: ${content.variantPerception}`,
    `Invalidation: ${content.invalidationConditions[0]}`,
  ].join("\n\n"),
  operating_model_xlsx: [
    "Workbook includes Assumptions, Operating Model, Valuation, Sensitivity, Comps, and Risk Triggers.",
    `Base case: ${content.baseCase}`,
    `Key assumption: ${content.modelAssumptions[0]?.label} = ${content.modelAssumptions[0]?.value}`,
    `Valuation: ${content.valuation[0]?.metric} ${content.valuation[0]?.value}`,
  ].join("\n\n"),
  pm_deck_pptx: [
    `${content.deckSlides.length} slide PM deck.`,
    `Opening slide: ${content.deckSlides[0]?.title}`,
    `Trade plan: ${content.tradeProposal.bias}; ${content.tradeProposal.addTrimExit}`,
  ].join("\n\n"),
});

export const completeEquityProject = ({
  content,
  project,
}: {
  project: EquityProject;
  content: EquityProjectGeneratedContent;
}): EquityProject => {
  const previews = buildArtifactPreviews(content);
  const now = new Date().toISOString();

  return {
    ...project,
    status: "ready",
    updatedAt: now,
    generatedContent: content,
    error: null,
    artifacts: {
      memo_docx: {
        ...project.artifacts.memo_docx,
        status: "ready",
        preview: previews.memo_docx,
        error: null,
      },
      operating_model_xlsx: {
        ...project.artifacts.operating_model_xlsx,
        status: "ready",
        preview: previews.operating_model_xlsx,
        error: null,
      },
      pm_deck_pptx: {
        ...project.artifacts.pm_deck_pptx,
        status: "ready",
        preview: previews.pm_deck_pptx,
        error: null,
      },
    },
  };
};

export const failEquityProject = ({
  error,
  project,
}: {
  project: EquityProject;
  error: string;
}): EquityProject => {
  const now = new Date().toISOString();
  return {
    ...project,
    status: "failed",
    updatedAt: now,
    error,
    artifacts: {
      memo_docx: { ...project.artifacts.memo_docx, status: "failed", error },
      operating_model_xlsx: {
        ...project.artifacts.operating_model_xlsx,
        status: "failed",
        error,
      },
      pm_deck_pptx: {
        ...project.artifacts.pm_deck_pptx,
        status: "failed",
        error,
      },
    },
  };
};

export const isSubmittedThesisDraft = (
  draft: ThesisDraft | null,
): draft is ThesisDraft & { recommendation: ThesisRecommendation } =>
  Boolean(draft?.recommendation && draft.rationale.trim());
