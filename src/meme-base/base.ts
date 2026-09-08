/*
 * The meme base: a `.base` file whose views are written by the plugin,
 * one view per group of memes.
 *
 * The file is not written from nothing. Its own header — the filters, the
 * formulas and the properties — is left exactly as it is, and the first of its
 * views is the model every generated view is cut from: whatever it says about
 * the size of its cards, the image it shows and the order it sorts in is said
 * by every view of the rebuilt file as well, and the only thing each of them
 * says for itself is its name and the filter that narrows it down.
 *
 * So the file is yours as far as its look goes, and the plugin's as far as the
 * row of views goes. The views are replaced, all of them, on every run — the
 * first among them, which shows every meme there is, included.
 *
 * Nothing here touches the vault: it is handed the base file as it was read in
 * and answers what it should say instead.
 */

import type { MemeGroup } from "./tags";

/**
 * How the memes nothing was said about are sorted before anything the model
 * sorts by: by their tags, those being the tags of other trees — a Topics/War,
 * a Media/Batman — and all such a meme is told apart by.
 */
const BY_TAGS = { property: "tags", direction: "ASC" };

/** What became of a run over the meme base. */
export type MemeBaseOutcome =
	| { kind: "no-file" }
	| { kind: "no-tag" }
	| { kind: "no-base"; path: string }
	| { kind: "unreadable"; path: string; problem: string }
	| { kind: "no-views"; path: string }
	| { kind: "no-notes"; path: string; tag: string }
	| { kind: "no-groups"; path: string; tag: string }
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
 *
 * `hasTag` counts the tags below the one it is given, which is what the view of
 * every meme is after, and what the memes nothing was said about have to be
 * shielded from: they are asked for by the top-level tag and then narrowed
 * down by turning down every tag below it, all in one call.
 */
export function filtersOfGroup(group: MemeGroup): Record<string, unknown> {
	const and: unknown[] = [`file.hasTag("${group.tag}")`];

	if (group.without.length > 0) {
		const tags = group.without.map((tag) => `"${tag}"`).join(", ");

		and.push({ not: [`file.hasTag(${tags})`] });
	}

	return { and };
}

/**
 * How one group is sorted: the way the model sorts, with the tags of a note
 * coming first for the group that asks for them.
 */
function sortOfGroup(model: unknown, group: MemeGroup): unknown[] {
	const sorted: unknown[] = Array.isArray(model) ? copy<unknown[]>(model) : [];

	return group.byTags ? [copy(BY_TAGS), ...sorted] : sorted;
}

/**
 * One view of one group, cut from the model: everything the model says is said
 * again, its name and its filter being the plugin's own to fill in, and the
 * order it sorts in the model's unless the group asks for its own. The name and
 * the filter are written where the model carries them, so that a generated view
 * reads in the same order as the one it was cut from.
 */
function viewOfGroup(model: Record<string, unknown>, group: MemeGroup): Record<string, unknown> {
	const view: Record<string, unknown> = {};
	let named = false;

	const name = (): void => {
		view.name = group.name;
		view.filters = filtersOfGroup(group);
		named = true;
	};

	for (const [key, value] of Object.entries(model)) {
		if (key === "name" || key === "filters") {
			if (!named) {
				name();
			}

			continue;
		}

		view[key] = key === "sort" ? sortOfGroup(value, group) : copy(value);
	}

	if (!named) {
		name();
	}

	// A model that sorts by nothing at all still leaves the group that sorts by
	// its tags to say so.
	if (group.byTags && !("sort" in view)) {
		view.sort = sortOfGroup(null, group);
	}

	return view;
}

/**
 * The base file as it should say it: its header untouched, one view per group,
 * all of them cut from the view the file opened with.
 *
 * A file without a single view is left alone. There would be nothing to cut
 * the generated views from, and guessing at a look for them would end in a
 * base that shows the memes in a way nobody asked for.
 */
export function rebuildMemeBaseViews(
	base: unknown,
	groups: readonly MemeGroup[],
): MemeBaseRebuild {
	const file = asRecord(base);

	if (file === null) {
		return { kind: "no-views" };
	}

	const views = Array.isArray(file.views) ? file.views : [];
	const model = views.length === 0 ? null : asRecord(views[0]);

	// Without a group there would be nothing to write but an empty row of
	// views, which is no base at all. A run never gets this far — it stops as
	// soon as it finds that no note of the vault carries the tag.
	if (model === null || groups.length === 0) {
		return { kind: "no-views" };
	}

	const rebuilt = groups.map((group) => viewOfGroup(model, group));

	return { kind: "rebuilt", base: { ...file, views: rebuilt }, views: rebuilt.length };
}

/** Turns what became of a run into the line a notice shows. */
export function describeMemeBaseRun(outcome: MemeBaseOutcome): string {
	switch (outcome.kind) {
		case "no-file":
			return "No meme base is set. Name one in the settings of the plugin.";
		case "no-tag":
			return "No meme tag is set. Name one in the settings of the plugin.";
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
		case "no-groups":
			return (
				`There would be no view to write: no tag below "${outcome.tag}" is used, ` +
				"and the two views that are not one of the meme tags are unnamed. Name one " +
				"of them in the settings of the plugin."
			);
		case "written":
		case "unchanged": {
			const views = `${outcome.views} ${outcome.views === 1 ? "view" : "views"}`;
			const notes = `${outcome.notes} ${outcome.notes === 1 ? "note" : "notes"}`;
			const headline = outcome.kind === "written" ? "Rebuilt" : "Nothing to change in";

			return `${headline} "${outcome.path}": ${views} over ${notes}.`;
		}
	}
}
