import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Slice 0 package entry point.
 *
 * This factory intentionally registers no events, commands, tools, flags, UI,
 * providers, timers, or background work. Automatic Advisor behavior is not
 * implemented in Slice 0.
 */
export default function piAdvisor(pi: ExtensionAPI): void {
	void pi;
}
