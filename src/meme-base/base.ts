/*
 * The base of the memes: a `.base` file whose views are written by the plugin,
 * one view per group of memes.
 *
 * The file is not written from nothing. Its own header — the filters, the
 * formulas and the properties — is left exactly as it is, and so is the first
 * of its views, which is the one that shows every meme there is. That first
 * view is also the model the generated ones are cut from: whatever it says
 * about the size of its cards, the image it shows and the order it sorts in is
 * said by every view after it as well, and the only thing they add is the
 * filter that narrows them down to their own group.
 *
 * So the file is yours as far as its look goes, and the plugin's as far as the
 * row of views goes. Everything after the first view is replaced on every run.
 *
 * Nothing here touches the vault: it is handed the base file as it was read in
 * and answers what it should say instead.
 */

import type { MemeGroup } from "./tags";

/** What became of a run over the base of the memes. */
export type MemeBaseOutcome =
	| { kind: "no-file" }
	| { kind: "no-tag" }
	| { kind: "no-base"; path: string }
	| { kind: "unreadable"; path: string; problem: string }
	| { kind: "no-views"; path: string }
	| { kind: "no-notes"; path: string; tag: string }
	| { kind: "written"; path: string; views: number; notes: number }
	| { kind: "unchanged"; path: string; views: number; notes: number };

/** What a rebuilt base file says, or why it could not be rebuilt. */
export type MemeBaseRebuild =
	| { kind: "rebuilt"; base: Record<string, unknown>; views: number }
	| { kind: "no-views" };

/** The base file as it was read in: a mapping of whatever it happens to hold. */
function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/**
 * A value of the base file as it stands, free of the original. The views are
 * cut from one and the same model, and a value they all pointed at would come
 * out of the file as a YAML anchor referred to over and over instead of as a
 * value of its own.
 */
function copy<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The filter a view of one group carries. Everything the base filters on as a
 * whole — the folder its memes live in, above all — holds for these as well:
 * the filters of a view and those of the file are met together.
 */
export function filtersOfGroup(topTag: string, group: MemeGroup): Record<string, unknown> {
	if (group.tag !== null) {
		return { and: [`file.hasTag("${group.tag}")`] };
	}

	// `hasTag` counts the tags below the one it is given as well, so the memes
	// that carry nothing below the top-level tag have to be picked out by hand:
	// they are the ones whose own tags say nothing more than the top-level one.
	return {
		and: [
			`file.hasTag("${topTag}")`,
			`file.tags.filter(value.startsWith("${topTag}/")).isEmpty()`,
		],
	};
}

/**
 * One view of one group, cut from the model: everything the model says is said
 * again, its name and its filter being the plugin's own to fill in. They are
 * written where the model carries them, so that a generated view reads in the
 * same order as the one it was cut from.
 */
function viewOfGroup(
	model: Record<string, unknown>,
	topTag: string,
	group: MemeGroup,
): Record<string, unknown> {
	const view: Record<string, unknown> = {};
	let named = false;

	const name = (): void => {
		view.name = group.name;
		view.filters = filtersOfGroup(topTag, group);
		named = true;
	};

	for (const [key, value] of Object.entries(model)) {
		if (key === "name" || key === "filters") {
			if (!named) {
				name();
			}

			continue;
		}

		view[key] = copy(value);
	}

	if (!named) {
		name();
	}

	return view;
}

/**
 * The base file as it should say it: its header and its first view untouched,
 * every view after them one of the groups.
 *
 * A file without a single view is left alone. There would be nothing to cut
 * the generated views from, and guessing at a look for them would end in a
 * base that shows the memes in a way nobody asked for.
 */
export function rebuildMemeBaseViews(
	base: unknown,
	topTag: string,
	groups: readonly MemeGroup[],
): MemeBaseRebuild {
	const file = asRecord(base);

	if (file === null) {
		return { kind: "no-views" };
	}

	const views = Array.isArray(file.views) ? file.views : [];
	const model = views.length === 0 ? null : asRecord(views[0]);

	if (model === null) {
		return { kind: "no-views" };
	}

	const generated = groups.map((group) => viewOfGroup(model, topTag, group));

	return {
		kind: "rebuilt",
		base: { ...file, views: [model, ...generated] },
		views: generated.length,
	};
}

/** Turns what became of a run into the line a notice shows. */
export function describeMemeBaseRun(outcome: MemeBaseOutcome): string {
	switch (outcome.kind) {
		case "no-file":
			return "No base of the memes is set. Name one in the settings of the plugin.";
		case "no-tag":
			return "No tag of the memes is set. Name one in the settings of the plugin.";
		case "no-base":
			return `There is no "${outcome.path}" in the vault.`;
		case "unreadable":
			return `"${outcome.path}" could not be read: ${outcome.problem}.`;
		case "no-views":
			return (
				`"${outcome.path}" has no view the generated ones could be cut from. ` +
				"Add the view that shows every meme, then run the command again."
			);
		case "no-notes":
			return `No note of the vault carries the tag "${outcome.tag}".`;
		case "written":
		case "unchanged": {
			const views = `${outcome.views} ${outcome.views === 1 ? "view" : "views"}`;
			const notes = `${outcome.notes} ${outcome.notes === 1 ? "note" : "notes"}`;
			const headline = outcome.kind === "written" ? "Rebuilt" : "Nothing to change in";

			return `${headline} "${outcome.path}": ${views} over ${notes}.`;
		}
	}
}
