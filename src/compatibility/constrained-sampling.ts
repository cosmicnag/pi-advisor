import type { Api, Model } from "@earendil-works/pi-ai";

export type AdviseSchemaMode = "strict" | "portable";
export type ConstrainedSamplingImporter = () => Promise<unknown>;
export type ConstrainedSamplingProbe = () => Promise<boolean>;

const CONSTRAINED_SAMPLING_MODULE = "@earendil-works/pi-ai/api/constrained-sampling";

const defaultImporter: ConstrainedSamplingImporter = async () =>
	import(CONSTRAINED_SAMPLING_MODULE);

const probeCache = new WeakMap<ConstrainedSamplingImporter, Promise<boolean>>();

function hasStrictSamplingResolver(module: unknown): boolean {
	if (module === null || typeof module !== "object") return false;
	return typeof (module as Record<string, unknown>).resolveJsonSchemaStrictSampling === "function";
}

/**
 * Probe for Pi's constrained-sampling subpath without making older Pi versions
 * fail while loading this package. Results are cached per importer.
 */
export function probeConstrainedSamplingSupport(
	importModule: ConstrainedSamplingImporter = defaultImporter,
): Promise<boolean> {
	const cached = probeCache.get(importModule);
	if (cached !== undefined) return cached;

	const result = (async () => {
		try {
			return hasStrictSamplingResolver(await importModule());
		} catch {
			return false;
		}
	})();
	probeCache.set(importModule, result);
	return result;
}

function hasExplicitStrictCapability(model: Model<Api>): boolean {
	const compat: unknown = model.compat;
	if (compat === undefined || compat === null || typeof compat !== "object") return false;
	const flags = compat as Record<string, unknown>;

	switch (model.api) {
		case "anthropic-messages":
			return flags.supportsStrictTools === true;
		case "openai-responses":
		case "openai-completions":
		case "bedrock-converse-stream":
			return flags.supportsStrictMode === true;
		default:
			return false;
	}
}

/** Select strict schemas only when both Pi and the selected model explicitly support them. */
export async function resolveAdviseSchemaMode(
	model: Model<Api>,
	probe: ConstrainedSamplingProbe = probeConstrainedSamplingSupport,
): Promise<AdviseSchemaMode> {
	try {
		if (!hasExplicitStrictCapability(model)) return "portable";
		return (await probe()) ? "strict" : "portable";
	} catch {
		return "portable";
	}
}
