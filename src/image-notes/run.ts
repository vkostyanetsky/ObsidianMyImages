/*
 * Binding a run over the notes of the image folders to the vault: which notes
 * take part, and what is written to the console while they are gone through.
 */

import type { App, TFile } from "obsidian";

import { log, logProblem } from "../log";
import { isInAnyFolder } from "../settings/settings";
import type { ImageNote, NoteRule, NotesRunSummary } from "./rules";
import { addToSummary, describeNoteOutcome, emptySummary, updateNote } from "./rules";

/** The note as the rules are handed it. */
export function asImageNote(file: TFile): ImageNote {
	return { path: file.path, name: file.basename };
}

/** The note, but only when it sits in one of the image folders. */
export function imageNoteOf(file: TFile, folders: string[]): ImageNote | null {
	if (file.extension !== "md" || !isInAnyFolder(file.path, folders)) {
		return null;
	}

	return asImageNote(file);
}

/**
 * Applies the rules to every note of the given folders, one after the other,
 * and reports what came of it.
 *
 * A run is always asked for: by one of the commands, or once when the vault is
 * opened. Nothing here listens to the vault, so no note is ever touched while
 * it is being written.
 */
export async function updateNotesInFolders(
	app: App,
	folders: string[],
	rules: NoteRule[],
): Promise<NotesRunSummary> {
	const all = app.vault.getMarkdownFiles();
	const notes = all.filter((note) => isInAnyFolder(note.path, folders));
	const summary = emptySummary();

	log(
		`going through ${notes.length} of ${all.length} notes of the vault, ` +
			`from ${folders.length === 0 ? "no folder" : folders.join(", ")}`,
	);

	for (const file of notes) {
		const outcome = await updateNote(rules, asImageNote(file));
		const line = `"${file.path}": ${describeNoteOutcome(outcome)}`;

		if (outcome.kind === "updated" || outcome.kind === "unchanged") {
			if (outcome.failures.length > 0) {
				logProblem(line);
			} else if (outcome.kind === "updated") {
				// The notes that needed nothing are not worth a line of their own.
				log(line);
			}
		}

		addToSummary(summary, outcome);
	}

	log(
		`done: ${summary.updated} of ${summary.notes} notes updated, ` +
			`${summary.failures.length} left alone`,
	);

	return summary;
}
