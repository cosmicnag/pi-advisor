import { readFileSync } from "node:fs";

interface PackManifest {
	name: string;
	version: string;
	filename: string;
	files: { path: string }[];
}

const inputPath = process.argv[2] ?? "pack.json";
const pack = JSON.parse(readFileSync(inputPath, "utf8")) as PackManifest;
const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
	name: string;
	version: string;
};
const paths = pack.files.map((file) => file.path);

if (pack.name !== manifest.name || pack.version !== manifest.version) {
	throw new Error(
		`Packed identity ${pack.name}@${pack.version} does not match ${manifest.name}@${manifest.version}`,
	);
}

const required = [
	"LICENSE",
	"README.md",
	"THIRD_PARTY_NOTICES.md",
	"package.json",
	"src/index.ts",
	"docs/behavior-contract.md",
	"docs/omp-parity.md",
];
for (const path of required) {
	if (!paths.includes(path)) throw new Error(`Missing packed file: ${path}`);
}

const forbidden = paths.filter(
	(path) =>
		path === "CONTEXT.md" ||
		path.startsWith("docs/internal/") ||
		path.startsWith("tests/") ||
		path.startsWith("scripts/") ||
		path.startsWith(".github/"),
);
if (forbidden.length > 0) throw new Error(`Forbidden packed files: ${forbidden.join(", ")}`);

process.stdout.write(`Validated ${pack.filename}: ${String(paths.length)} files\n`);
