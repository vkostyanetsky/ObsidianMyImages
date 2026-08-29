/*
 * Copies the built plugin into an Obsidian vault.
 *
 * Usage: node scripts/deploy.mjs [vault path]
 *
 * The vault is taken from the first argument, then from the OBSIDIAN_VAULT
 * environment variable, then from OBSIDIAN_VAULT in the .env file of the
 * project. The files land in <vault>/.obsidian/plugins/<plugin id>/, where the
 * id comes from manifest.json.
 */

import { copyFile, mkdir, readFile, access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** Files of a plugin release. Only the required ones have to exist. */
const FILES = [
	{ name: "main.js", required: true },
	{ name: "manifest.json", required: true },
	{ name: "styles.css", required: false },
];

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exists(target) {
	try {
		await access(target);
		return true;
	} catch {
		return false;
	}
}

/**
 * Reads `KEY=value` pairs of a .env file. Comments (`#`), blank lines and the
 * quotes around a value are ignored; nothing else is interpreted, so a Windows
 * path can be written as it is. Returns an empty object when there is no file.
 */
async function readEnvFile(file) {
	let text;

	try {
		text = await readFile(file, "utf8");
	} catch {
		return {};
	}

	const values = {};

	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();

		if (trimmed === "" || trimmed.startsWith("#")) {
			continue;
		}

		const separator = trimmed.indexOf("=");

		if (separator === -1) {
			continue;
		}

		const key = trimmed.slice(0, separator).trim();
		const value = trimmed.slice(separator + 1).trim();

		values[key] = value.replace(/^(["'])(.*)\1$/, "$2");
	}

	return values;
}

async function main() {
	const env = await readEnvFile(path.join(projectRoot, ".env"));
	const configured = [process.argv[2], process.env.OBSIDIAN_VAULT, env.OBSIDIAN_VAULT].find(
		(value) => value !== undefined && value.trim() !== "",
	);

	if (configured === undefined) {
		throw new Error(
			"No vault configured. Copy .env.example to .env and set OBSIDIAN_VAULT in it, " +
				"or pass the vault path as an argument.",
		);
	}

	const vault = path.resolve(configured);

	if (!(await exists(path.join(vault, ".obsidian")))) {
		throw new Error(`${vault} does not look like an Obsidian vault: no .obsidian folder in it.`);
	}

	const manifest = JSON.parse(await readFile(path.join(projectRoot, "manifest.json"), "utf8"));
	const target = path.join(vault, ".obsidian", "plugins", manifest.id);

	await mkdir(target, { recursive: true });

	for (const file of FILES) {
		const source = path.join(projectRoot, file.name);

		if (!(await exists(source))) {
			if (file.required) {
				throw new Error(`${file.name} is missing. Run "npm run build" first.`);
			}
			continue;
		}

		await copyFile(source, path.join(target, file.name));
		console.log(`copied ${file.name}`);
	}

	console.log(`\n${manifest.name} ${manifest.version} deployed to ${target}`);
	console.log("Reload the plugin in Obsidian to pick up the change.");
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
