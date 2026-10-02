import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// SAFETY: this test fixture deliberately supplies the asserted boundary shape.
const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
	name: string;
	version: string;
	private?: boolean;
	keywords?: string[];
	files?: string[];
	publishConfig?: { access?: string; provenance?: boolean; tag?: string };
	pi?: { extensions?: string[]; image?: string };
	peerDependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	dependencies?: Record<string, string>;
	bundledDependencies?: string[] | boolean;
	bundleDependencies?: string[] | boolean;
	engines?: { node?: string };
};
const readme = readFileSync("README.md", "utf8");
const configuration = readFileSync("docs/configuration.md", "utf8");
const compatibilityDocs = ["README.md", "docs/configuration.md", "docs/security.md"].map(
	(path) => ({ path, content: readFileSync(path, "utf8") }),
);
const publicDocs = [
	"README.md",
	"THIRD_PARTY_NOTICES.md",
	"docs/configuration.md",
	"docs/security.md",
].map((path) => ({ path, content: readFileSync(path, "utf8") }));

describe("public release surface", () => {
	it("declares discoverable publishable 0.4.1 metadata", () => {
		expect(manifest).toMatchObject({
			name: "@ribbons-digital/pi-advisor",
			version: "0.4.1",
			publishConfig: { access: "public", provenance: true },
			pi: {
				extensions: ["./src/index.ts"],
				image:
					"https://raw.githubusercontent.com/ribbons-digital/pi-advisor/66cd0253c6ee84471a9870dfce806fc767f26bd3/docs/assets/advisor-in-action.png",
			},
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

	it("uses wildcard host peers and pinned Pi 1.0.0 development dependencies", () => {
		for (const packageName of [
			"@earendil-works/pi-agent-core",
			"@earendil-works/pi-ai",
			"@earendil-works/pi-coding-agent",
			"@earendil-works/pi-tui",
			"typebox",
		]) {
			expect(manifest.peerDependencies?.[packageName], packageName).toBe("*");
			expect(manifest.dependencies, packageName).not.toHaveProperty(packageName);
			expect(manifest.devDependencies?.[packageName], packageName).toBe(
				packageName === "typebox" ? "1.3.27" : "1.0.0",
			);
		}
		expect(manifest.dependencies).toEqual({ yaml: "^2.9.0" });
		expect(manifest.bundledDependencies).toBeUndefined();
		expect(manifest.bundleDependencies).toBeUndefined();
	});

	it("rejects invalid host dependency declarations and bundled host modules", () => {
		const root = mkdtempSync(join(tmpdir(), "pi-advisor-pack-contract-"));
		const pack = {
			name: manifest.name,
			version: manifest.version,
			filename: "pi-advisor-package.tgz",
			files: [
				"LICENSE",
				"README.md",
				"THIRD_PARTY_NOTICES.md",
				"package.json",
				"src/index.ts",
				"docs/configuration.md",
				"docs/security.md",
			].map((path) => ({ path })),
		};
		const cases = [
			{
				manifest: {
					...manifest,
					peerDependencies: { ...manifest.peerDependencies, typebox: "^1.3.27" },
				},
				pack,
				error: "typebox must be a wildcard peer dependency",
			},
			{
				manifest: { ...manifest, dependencies: { ...manifest.dependencies, typebox: "1.3.27" } },
				pack,
				error: "typebox must not be a runtime dependency",
			},
			{
				manifest: { ...manifest, bundledDependencies: ["typebox"] },
				pack,
				error: "typebox must not be bundled",
			},
			{
				manifest: { ...manifest, bundleDependencies: ["@earendil-works/pi-ai"] },
				pack,
				error: "pi-ai must not be bundled",
			},
			{
				manifest,
				pack: { ...pack, files: [...pack.files, { path: "node_modules/typebox/index.js" }] },
				error: "Forbidden packed files: node_modules/typebox/index.js",
			},
		];
		try {
			for (const fixture of cases) {
				writeFileSync(join(root, "package.json"), JSON.stringify(fixture.manifest));
				writeFileSync(join(root, "pack.json"), JSON.stringify(fixture.pack));
				const result = spawnSync(
					join(process.cwd(), "node_modules", ".bin", "tsx"),
					[join(process.cwd(), "scripts", "validate-pack.ts"), "pack.json"],
					{ cwd: root, encoding: "utf8", timeout: 10_000 },
				);
				expect(result.error).toBeUndefined();
				expect(result.status, fixture.error).toBe(1);
				expect(result.stderr).toContain(fixture.error);
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("documents published-release compatibility, install, update, and uninstall guidance", () => {
		expect(manifest.engines?.node).toBe(">=22.19.0");
		// The Pi 1.0.0 baseline is not a runtime support claim during the packaging-only phase.
		for (const document of compatibilityDocs) {
			expect(document.content, document.path).toContain(">=22.19.0");
			expect(document.content, document.path).toContain(">=0.81.1 <0.85.0");
			expect(document.content, document.path).toContain(
				"Pi 0.82.0 is the primary tested Pi release",
			);
			expect(document.content, document.path).toContain(
				"compatibility coverage retained for Pi 0.81.1, Pi 0.83.0, and Pi 0.84.1",
			);
		}
		expect(readme).toContain("Pi Advisor 0.4.1 requires Pi");
		expect(readme).toContain("Declared compatibility range: >=0.81.1 <0.85.0");
		expect(readme).toContain("Primary tested Pi release: 0.82.0");
		expect(readme).toContain("Compatibility-tested Pi releases: 0.81.1, 0.83.0, and 0.84.1");
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

	it("documents model-aware independent Advisor reasoning configuration", () => {
		expect(configuration).toContain(
			"Advisor reasoning choices are derived from the selected model's supported levels",
		);
		expect(configuration).toContain("unsupported levels are omitted");
		expect(configuration).toContain("without reasoning support offers only `off`");
		expect(configuration).toContain("warns and requires a new supported selection");
		expect(configuration).toContain("current Executor reasoning level as supplementary context");
		expect(configuration).toContain("Advisor selection remains independent");
		expect(configuration).toContain("is not automatically coupled");
		expect(configuration).toContain(
			"Pi 0.81 compatibility path omits the supplementary Executor text without changing selection or runtime behavior",
		);
	});

	it("keeps internal development history out of public documentation", () => {
		for (const document of publicDocs) {
			expect(document.content, document.path).not.toMatch(/\bSlice\s+\d/i);
			expect(document.content, document.path).not.toMatch(/^## Development$/m);
			expect(document.content, document.path).not.toContain("docs/internal");
		}
	});
});
