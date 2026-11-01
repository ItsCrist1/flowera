/** Model-maker logos, copied from trustlens. Used by the model picker. */
export type Pic = { icon: string; alt: string, className?: string };

export const pics_corpos: Record<string, Pic> = {
    openai: { icon: "/icons/openai.svg", alt: "OpenAI logo", className: "invert dark:invert-0" },
    anthropic: { icon: "/icons/anthropic.svg", alt: "Anthropic logo" },
    google: { icon: "/icons/google.svg", alt: "Google logo" },
    "z-ai": { icon: "/icons/zai.svg", alt: "ZAI logo", className: "dark:invert" },
    "zai": { icon: "/icons/zai.svg", alt: "ZAI logo", className: "dark:invert" },
    deepseek: { icon: "/icons/deepseek.svg", alt: "DeepSeek logo" },
    qwen: { icon: "/icons/qwen.svg", alt: "Qwen logo" },
    alibaba: { icon: "/icons/qwen.svg", alt: "Alibaba logo" },
    "x-ai": { icon: "/icons/xai.svg", alt: "XAI logo", className: "dark:invert" },
    "spacexai": { icon: "/icons/xai.svg", alt: "SpaceXAI logo", className: "dark:invert" },
    meta: { icon: "/icons/meta.svg", alt: "Meta logo" },
    "meta-llama": { icon: "/icons/meta.svg", alt: "Meta logo" },
    bytedance: { icon: "/icons/bytedance.svg", alt: "Bytedance logo" },
    amazon: { icon: "/icons/amazon.svg", alt: "Amazon logo" },
    mistralai: { icon: "/icons/mistral.svg", alt: "MistralAI logo" },
    mistral: { icon: "/icons/mistral.svg", alt: "MistralAI logo" },
    moonshotai: { icon: "/icons/moonshot.svg", alt: "MoonshotAI logo", className: "dark:invert" },
    tencent: { icon: "/icons/tencent.svg", alt: "Tencent logo" },
    nvidia: { icon: "/icons/nvidia.svg", alt: "NVIDIA logo" },
    xiaomi: { icon: "/icons/xiaomi.svg", alt: "Xiaomi logo", className: "dark:invert" },
    perplexity: { icon: "/icons/perplexity.svg", alt: "Perplex logo" },
    minimax: { icon: "/icons/minimax.svg", alt: "Minimax logo" },
    microsoft: { icon: "/icons/microsoft.svg", alt: "Microsoft logo" },
    nousresearch: { icon: "/icons/nousresearch.svg", alt: "NousResearch logo", className: "dark:invert" },
    poolside: { icon: "/icons/poolside.svg", alt: "Poolside logo" },
};

export const pics_models: Record<string, Pic> = {
    gpt: pics_corpos.openai,
    claude: pics_corpos.anthropic,
    gemini: pics_corpos.google,
    gemma: pics_corpos.google,
    glm: pics_corpos["z-ai"],
    deepseek: pics_corpos.deepseek,
    qwen: pics_corpos.qwen,
    grok: pics_corpos["x-ai"],
    muse: pics_corpos.meta,
    llama: pics_corpos.meta,
    doubao: pics_corpos.bytedance,
    amazon: pics_corpos.amazon,
    nova: pics_corpos.amazon,
    mistral: pics_corpos.mistral,
    ministral: pics_corpos.mistral,
    codestral: pics_corpos.mistral,
    kimi: pics_corpos.moonshotai,
    hy: pics_corpos.tencent,
    hunyuan: pics_corpos.tencent,
    nemotron: pics_corpos.nvidia,
    mimo: pics_corpos.xiaomi,
    sonar: pics_corpos.perplexity,
    minimax: pics_corpos.minimax,
    phi: pics_corpos.microsoft,
    hermes: pics_corpos.nousresearch,
    deephermes: pics_corpos.nousresearch
};

/**
 * Best-effort logo for a model id such as "openai/gpt-oss-20b", "gpt-oss:20b" or "nvidia/nemotron-3.5-lightning:free".
 * Tries the maker prefix first, then the model family name.
 */
export function getModelPic(model: string): Pic | undefined {
    const parts = model.toLowerCase().split("/");
    if (parts.length > 1 && pics_corpos[parts[0]]) return pics_corpos[parts[0]];
    const family = parts.at(-1)!.split(/[-.:\d_ ]/)[0];
    return pics_models[family] ?? pics_corpos[family];
}
