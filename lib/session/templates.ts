import {
    llmConfigSchema, questionDefaultsSchema, sessionConfigSchema,
    type SessionConfig, type TemplateId,
} from "@/lib/session/types";

/*
 * The four templates are presets over one config schema. Template-specific rules live here,
 * so the setup panels and the live session engine agree on what each template means.
 */

export type TemplateMeta = {
    id: TemplateId;
    name: string;
    tagline: string;
    description: string;
    bullets: string[];
    /** CSS color used for the tile's edges and accents. Tuned to match docs/setup_panels/panel_0/design.png. */
    color: string;
    /** Whether panel 1 (template configuration) is shown. */
    hasPanel1: boolean;
};

export const TEMPLATES: Record<TemplateId, TemplateMeta> = {
    hardcoded: {
        id: "hardcoded",
        name: "Hardcoded",
        tagline: "You write every question.",
        description: "Build your questions up front and decide when each one goes out: on a fixed timeline, or whenever you press Send.",
        bullets: ["Question builder", "Timeline every X minutes", "Manual sending any time", "No microphone, no AI"],
        color: "oklch(0.63 0.25 27)",
        hasPanel1: true,
    },
    automated: {
        id: "automated",
        name: "Automated",
        tagline: "The AI writes, you steer.",
        description: "Flowera listens to the lesson and an LLM writes questions from what was just taught. You choose when they're generated and whether you approve each one.",
        bullets: ["Live lesson transcript", "LLM-written questions", "LLM decides, every interval, or on demand", "Optional approval"],
        color: "oklch(0.66 0.26 350)",
        hasPanel1: true,
    },
    worriless: {
        id: "worriless",
        name: "Worriless",
        tagline: "Press start and teach.",
        description: "Nothing to configure. Flowera listens, and the LLM decides when a quick check would help and what to ask.",
        bullets: ["Zero setup", "LLM decides when and what", "Questions go out automatically"],
        color: "oklch(0.58 0.27 305)",
        hasPanel1: false,
    },
    customized: {
        id: "customized",
        name: "Customized",
        tagline: "Mix everything.",
        description: "Your own questions on a timeline, plus LLM-written questions alongside them, with every setting exposed.",
        bullets: ["Question builder + timeline", "Optional LLM questions", "Every setting exposed"],
        color: "oklch(0.52 0.27 264)",
        hasPanel1: true,
    },
};

export const TEMPLATE_ORDER: TemplateId[] = ["hardcoded", "automated", "worriless", "customized"];

export function createDefaultConfig(template: TemplateId): SessionConfig {
    return sessionConfigSchema.parse({
        template,
        questions: [],
        llm: llmConfigSchema.parse({ enabled: template === "customized" ? false : undefined }),
        defaults: questionDefaultsSchema.parse({}),
    });
}

/** Does this session use the LLM (and therefore the microphone)? */
export function usesLlm(config: SessionConfig): boolean {
    switch (config.template) {
        case "hardcoded": return false;
        case "automated": return true;
        case "worriless": return true;
        case "customized": return config.llm.enabled;
    }
}

/** Does this session use teacher-written questions? */
export function usesQuestionBank(config: SessionConfig): boolean {
    return config.template === "hardcoded" || config.template === "customized";
}

/** The LLM settings that actually apply, with template-fixed values enforced. */
export function effectiveLlm(config: SessionConfig) {
    if (config.template === "worriless")
        return { ...config.llm, enabled: true, trigger: "llm_decides" as const, requireApproval: false, systemPrompt: "" };
    return { ...config.llm, enabled: usesLlm(config) };
}

/** Problems that must be fixed before the session can start. */
export function validateConfig(config: SessionConfig): string[] {
    const errors: string[] = [];
    if (usesQuestionBank(config) && config.template === "hardcoded" && config.questions.length === 0)
        errors.push("Add at least one question.");
    if (usesQuestionBank(config) && config.questions.some(q => !q.text.trim()))
        errors.push("Every question needs text.");
    for (const q of config.questions) {
        if (q.type === "multiple_choice") {
            if (q.options.some(o => !o.trim())) { errors.push(`"${q.text || "Untitled"}" has an empty option.`); }
            if (q.correct.length === 0) { errors.push(`"${q.text || "Untitled"}" needs at least one correct option.`); }
        }
        if (q.type === "number") {
            if (q.correctMin > q.correctMax) errors.push(`"${q.text || "Untitled"}": the correct range is reversed.`);
            if (q.inputMin !== null && q.inputMax !== null && q.inputMin > q.inputMax) errors.push(`"${q.text || "Untitled"}": the input limit is reversed.`);
        }
    }
    if (usesLlm(config) && !config.llm.model) errors.push("Pick an LLM model.");
    return errors;
}
