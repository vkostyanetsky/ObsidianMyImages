/*
 * Naming the images of a note after the note itself, as a rule of the image
 * folders. The renaming itself lives next door; this is only what it comes to
 * when it is one of several things done to a note.
 */

import type { App } from "obsidian";

import type { ImageNote, NoteRule, RuleOutcome } from "../image-notes/rules";
import { NOTHING_TO_DO, changed, failed, unchanged } from "../image-notes/rules";
import type { MyImagesSettings } from "../settings/settings";
import type { ImageRenameOutcome } from "./rename";
import { describeOutcome, renameNoteImages, summarizeRename } from "./rename";
import { createNoteRenameHost } from "./vault-host";

/** What the renaming came to, in the terms a run over a note speaks in. */
function ruleOutcome(outcome: ImageRenameOutcome): RuleOutcome {
	switch (outcome.kind) {
		case "no-note":
		case "no-images":
			return NOTHING_TO_DO;
		case "conflict":
		case "failed":
			return failed(describeOutcome(outcome));
		case "renamed": {
			const summary = summarizeRename(outcome) ?? "";

			return outcome.renamed > 0 ? changed(summary) : unchanged(summary);
		}
	}
}

async function rename(app: App, note: ImageNote): Promise<RuleOutcome> {
	const file = app.vault.getFileByPath(note.path);

	if (file === null) {
		return failed(`there is no note at "${note.path}"`);
	}

	return ruleOutcome(await renameNoteImages(createNoteRenameHost(app, file)));
}

/** The image renaming as a rule, or `null` when it is switched off. */
export function createRenameImagesRule(app: App, settings: MyImagesSettings): NoteRule | null {
	if (!settings.imageNotes.renameImages.enabled) {
		return null;
	}

	return {
		id: "rename-images",
		apply: (note) => rename(app, note),
	};
}
