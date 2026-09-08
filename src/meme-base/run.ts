/*
 * Binding the base of the memes to the vault: which notes are counted, and how
 * the file is read and written.
 *
 * The whole vault is gone through, note by note, and every note carrying the
 * tag of the memes takes part, wherever it happens to live. The filters of the
 * base itself decide what is then shown — a base that only looks at one folder
 * shows the memes of that folder — so the views are built from the tags alone.
 *
 * The run is always asked for, by the command and by nothing else.
 */

import type { App } from "obsidian";
import { getAllTags, parseYaml, stringifyYaml } from "obsidian";

import { log, logProblem } from "../log";
import type { MemeBaseSettings } from "../settings/settings";
import { normalizeVaultPath } from "../settings/settings";
import type { MemeBaseOutcome } from "./base";
import { rebuildMemeBaseViews } from "./base";
import { groupMemeTags, normalizeTag } from "./tags";

/** Whatever went wrong, said in a way a notice can carry. */
function problemOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** The tags of every note of the vault, one list per note, `#` dropped. */
function tagsOfNotes(app: App): string[][] {
	const notes: string[][] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		const tags = cache === null ? null : getAllTags(cache);

		if (tags !== null && tags.length > 0) {
			notes.push(tags.map((tag) => tag.replace(/^#+/, "")));
		}
	}

	return notes;
}

/**
 * Writes the views of the base of the memes anew: one view per tag below the
 * one the memes sit under, plus one for the memes that carry nothing below it.
 *
 * The file is only written when it would come out saying something other than
 * it does, so a run that finds the views already in order leaves the
 * modification date of the base alone.
 */
export async function rebuildMemeBase(
	app: App,
	settings: MemeBaseSettings,
): Promise<MemeBaseOutcome> {
	const path = normalizeVaultPath(settings.file);
	const tag = normalizeTag(settings.tag);

	if (path === "") {
		return { kind: "no-file" };
	}

	if (tag === "") {
		return { kind: "no-tag" };
	}

	const file = app.vault.getFileByPath(path);

	if (file === null) {
		return { kind: "no-base", path };
	}

	let source: string;

	try {
		source = await app.vault.read(file);
	} catch (error) {
		logProblem(`"${path}" could not be read: ${problemOf(error)}`);

		return { kind: "unreadable", path, problem: problemOf(error) };
	}

	let base: unknown;

	try {
		base = parseYaml(source);
	} catch (error) {
		logProblem(`"${path}" does not read as a base file: ${problemOf(error)}`);

		return { kind: "unreadable", path, problem: problemOf(error) };
	}

	const { groups, notes } = groupMemeTags(tag, tagsOfNotes(app));

	log(`"${tag}" is carried by ${notes} notes of the vault, making up ${groups.length} groups`);

	if (notes === 0) {
		return { kind: "no-notes", path, tag };
	}

	const rebuilt = rebuildMemeBaseViews(base, tag, groups);

	if (rebuilt.kind === "no-views") {
		logProblem(`"${path}" has no view the generated ones could be cut from`);

		return { kind: "no-views", path };
	}

	for (const group of groups) {
		log(`view "${group.name}": ${group.notes} notes`);
	}

	const written = stringifyYaml(rebuilt.base);

	if (written === source) {
		log(`"${path}" already says this; left alone`);

		return { kind: "unchanged", path, views: rebuilt.views, notes };
	}

	await app.vault.modify(file, written);

	log(`"${path}" written: ${rebuilt.views} views after the first one`);

	return { kind: "written", path, views: rebuilt.views, notes };
}
