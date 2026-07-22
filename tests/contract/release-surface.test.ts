import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
	name: string;
	version: string;
	private?: boolean;
	keywords?: string[];
	files?: string[];
	publishConfig?: { access?: string; provenance?: boolean; tag?: string };
	pi?: { extensions?: string[] };
};
const readme = readFileSync("README.md", "utf8");
const publicDocs = [
	"README.md",
	"THIRD_PARTY_NOTICES.md",
	"docs/configuration.md",
	"docs/security.md",
].map((path) => ({ path, content: readFileSync(path, "utf8") }));

describe("public release surface", () => {
	it("declares discoverable publishable 0.2.1 metadata", () => {
		expect(manifest).toMatchObject({
			name: "@ribbons-digital/pi-advisor",
			version: "0.2.1",
			publishConfig: { access: "public", provenance: true },
			pi: { extensions: ["./src/index.ts"] },
		});
		expect(manifest.private).not.toBe(true);
		expect(manifest.publishConfig?.tag).toBeUndefined();
		expect(manifest.keywords).toEqual(expect.arrayContaining(["pi-package", "pi-extension"]));
		expect(manifest.files).toEqual([
			"src/",
			"README.md",
			"LICENSE",
			"THIRD_PARTY_NOTICES.md",
			"docs/assets/advisor-in-action.png",
			"docs/configuration.md",
			"docs/security.md",
		]);
	});

	it("documents official compatibility, install, update, and uninstall guidance", () => {
		expect(readme).toContain("Pi Advisor 0.2.1 requires Pi");
		expect(readme).toContain("Declared compatibility range: >=0.81.1 <0.82.0");
		expect(readme).toContain("Tested Pi release: 0.81.1");
		expect(readme).toContain("Pi Advisor 0.1.3 is the legacy release for Pi 0.80.7");
		expect(readme).toContain(
			"unverifiable provider parity leave Advisor inactive without fallback",
		);
		expect(readme).toContain("pi install npm:@ribbons-digital/pi-advisor");
		expect(readme).toContain("pi update --extensions");
		expect(readme).toContain("pi update npm:@ribbons-digital/pi-advisor");
		expect(readme).toContain("pi remove npm:@ribbons-digital/pi-advisor");
		expect(readme).toContain("version-pinned");
		expect(readme).toContain("intentionally skipped by package updates");
	});

	it("keeps internal development history out of public documentation", () => {
		for (const document of publicDocs) {
			expect(document.content, document.path).not.toMatch(/\bSlice\s+\d/i);
			expect(document.content, document.path).not.toMatch(/^## Development$/m);
			expect(document.content, document.path).not.toContain("docs/internal");
		}
	});
});
