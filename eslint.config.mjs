/*
 * What the linter looks at, and what it is told to leave alone.
 *
 * The recommended set of eslint-plugin-obsidianmd is the whole of it: it brings
 * the core rules of ESLint and the type-checked rules of typescript-eslint with
 * it, and adds the ones that only mean anything inside a plugin of Obsidian —
 * events that are never unregistered, an `innerHTML` where an element should be
 * built, an API newer than the plugin says it needs.
 */

import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	// The bundle esbuild writes, and whatever a test run leaves behind.
	globalIgnores(["main.js", "node_modules/", ".vitest/"]),

	...obsidianmd.configs.recommended,

	{
		languageOptions: {
			parserOptions: {
				// The type-checked rules need a TypeScript project to ask about
				// the code. The two files below are in none of them — they are
				// tools of the repository rather than parts of the plugin —
				// hence the exception.
				projectService: {
					allowDefaultProject: ["eslint.config.mjs", "scripts/*.mjs"],
				},
			},
		},
	},

	{
		// The build and the deployment run in Node, on this machine, and never
		// inside Obsidian: the rules that keep a plugin working on a phone, or
		// quiet in the console of one, have nothing to say about them. The
		// deployment writes into a vault from the outside, where the folder
		// Obsidian keeps its configuration in cannot be asked for either, and
		// what it prints is the only thing it says at all.
		files: ["*.mjs", "scripts/**/*.mjs"],
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
			"obsidianmd/hardcoded-config-path": "off",
			"obsidianmd/rule-custom-message": "off",
		},
	},

	{
		// Writing to the console is what this one file is for. The guideline it
		// goes against is about plugins that log while nobody asked them to;
		// here the lines are the debugging output the README speaks of, and
		// they are only written when the plugin does something to the vault.
		files: ["src/log.ts"],
		rules: {
			"obsidianmd/rule-custom-message": "off",
		},
	},

	{
		// The tests are not a plugin: nothing here is loaded by Obsidian, and
		// the rules that watch over a plugin's manners have nothing to say
		// about them.
		files: ["tests/**/*.ts"],
		rules: {
			"obsidianmd/sample-names": "off",
		},
	},
]);
