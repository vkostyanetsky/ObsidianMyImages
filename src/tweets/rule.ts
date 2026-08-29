/*
 * The day a tweet was posted on, as a rule of the image folders: a note that
 * links to a tweet carries that day as one of its properties.
 *
 * The date is worked out from the link alone, so it is always the same one and
 * the note is only ever written when it says something else. What the note
 * says loses: the id of the tweet is what the day is taken from.
 */

import type { App, TFile } from "obsidian";

import type { ImageNote, NoteRule, RuleOutcome } from "../image-notes/rules";
import { NOTHING_TO_DO, changed, failed, unchanged } from "../image-notes/rules";
import { log } from "../log";
import { setFrontmatterValues } from "../markdown/frontmatter";
import type { MyImagesSettings } from "../settings/settings";
import { noteTweetDate } from "./tweets";

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Writes the date into the note, and says whether that changed anything. */
async function writeDate(app: App, file: TFile, property: string, date: string): Promise<boolean> {
	const written = { changed: false };

	await app.vault.process(file, (source) => {
		const updated = setFrontmatterValues(source, [{ key: property, value: date }]);

		if (updated === null) {
			return source;
		}

		written.changed = true;

		return updated;
	});

	return written.changed;
}

async function fillInDate(app: App, note: ImageNote, property: string): Promise<RuleOutcome> {
	const file = app.vault.getFileByPath(note.path);

	if (file === null) {
		return failed(`there is no note at "${note.path}"`);
	}

	const date = noteTweetDate(await app.vault.cachedRead(file));

	if (date === null) {
		return NOTHING_TO_DO;
	}

	try {
		if (!(await writeDate(app, file, property, date))) {
			return unchanged(`the date is already ${date}`);
		}
	} catch (error) {
		return failed(`Could not write the date of the tweet: ${describeError(error)}`);
	}

	log(`writing ${property} ${date} to "${note.path}", taken from the tweet it links to`);

	return changed(`date ${date}`);
}

/** The date of a tweet as a rule, or `null` when it is switched off. */
export function createTweetDateRule(app: App, settings: MyImagesSettings): NoteRule | null {
	if (!settings.imageNotes.tweetDate.enabled) {
		return null;
	}

	const property = settings.imageNotes.tweetDate.property;

	return {
		id: "tweet-date",
		apply: (note) => fillInDate(app, note, property),
	};
}
