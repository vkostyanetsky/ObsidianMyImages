/*
 * Keeping the notes of the image folders in shape.
 *
 * Every kind of change the plugin makes to such a note — naming its images
 * after it, writing down the day the tweet it links to was posted on — is a
 * rule, and a rule only ever answers what became of the one note it was handed.
 * The rules of a run are applied one after the other, in the order they are
 * given in, and each of them decides on its own whether anything has to be
 * written at all.
 *
 * Nothing here runs by itself. A run is always asked for, by one of the two
 * commands or once when the vault has been read in.
 */

/** A note of the image folders, as a rule is handed it. */
export interface ImageNote {
	/** Vault path of the note, its `.md` extension included. */
	path: string;
	/** Name of the note, without that extension. */
	name: string;
}

/** What one rule came to for one note. */
export interface RuleOutcome {
	/** Whether the rule wrote to the note, or to the files it points at. */
	changed: boolean;
	/** The rule's share of the notice, such as `renamed 3 images`. */
	summary: string | null;
	/** Why the rule could not be applied, or `null` when it went through. */
	failure: string | null;
}

/** One kind of change the notes of the image folders are kept in. */
export interface NoteRule {
	/** Stable name of the rule, used in the log. */
	readonly id: string;
	/** Applies the rule to one note. The call never rejects. */
	apply(note: ImageNote): Promise<RuleOutcome>;
}

/** What became of a run over one note. */
export type NoteOutcome =
	| { kind: "no-note" }
	| { kind: "no-rules" }
	| { kind: "updated"; note: ImageNote; summaries: string[]; failures: string[] }
	| { kind: "unchanged"; note: ImageNote; summaries: string[]; failures: string[] };

/** What became of a run over every note of the image folders. */
export interface NotesRunSummary {
	/** How many notes were looked at. */
	notes: number;
	/** How many of them were written. */
	updated: number;
	/** One line per rule that could not be applied, naming the note. */
	failures: string[];
}

/** The outcome of a rule that found nothing to do. */
export const NOTHING_TO_DO: RuleOutcome = { changed: false, summary: null, failure: null };

/** The outcome of a rule that wrote something. */
export function changed(summary: string): RuleOutcome {
	return { changed: true, summary, failure: null };
}

/** The outcome of a rule that found the note already the way it wants it. */
export function unchanged(summary: string): RuleOutcome {
	return { changed: false, summary, failure: null };
}

/** The outcome of a rule that could not be applied. */
export function failed(message: string): RuleOutcome {
	return { changed: false, summary: null, failure: message };
}

/**
 * Applies every rule to the note, in the order they are given in, and gathers
 * what they came to. A rule that fails does not hold up the ones behind it:
 * the renaming of the images and the date of a tweet have nothing to do with
 * each other, and one of them going wrong is no reason to skip the other.
 */
export async function updateNote(rules: NoteRule[], note: ImageNote): Promise<NoteOutcome> {
	if (rules.length === 0) {
		return { kind: "no-rules" };
	}

	const summaries: string[] = [];
	const failures: string[] = [];
	let written = false;

	for (const rule of rules) {
		const outcome = await rule.apply(note);

		written = written || outcome.changed;

		if (outcome.summary !== null) {
			summaries.push(outcome.summary);
		}

		if (outcome.failure !== null) {
			failures.push(outcome.failure);
		}
	}

	return { kind: written ? "updated" : "unchanged", note, summaries, failures };
}

/** The lines of a notice, the ones that say nothing left out. */
function lines(...parts: (string | null)[]): string {
	return parts.filter((part): part is string => part !== null && part !== "").join("\n");
}

/** Turns the outcome of a single note into the line a notice shows. */
export function describeNoteOutcome(outcome: NoteOutcome): string {
	switch (outcome.kind) {
		case "no-note":
			return "No active Markdown note.";
		case "no-rules":
			return (
				"Nothing is done to the notes of the image folders. " +
				"Switch a rule on in the settings of the plugin."
			);
		case "updated":
		case "unchanged": {
			const summaries = outcome.summaries.join("; ");
			const headline =
				outcome.kind === "updated"
					? `Updated "${outcome.note.name}"${summaries === "" ? "" : `: ${summaries}`}.`
					: summaries === ""
						? `Nothing to update in "${outcome.note.name}".`
						: `Nothing to update in "${outcome.note.name}": ${summaries}.`;

			return lines(headline, ...outcome.failures);
		}
	}
}

/** A summary nothing has been added to yet. */
export function emptySummary(): NotesRunSummary {
	return { notes: 0, updated: 0, failures: [] };
}

/** Adds what became of one note to a running summary. */
export function addToSummary(summary: NotesRunSummary, outcome: NoteOutcome): void {
	if (outcome.kind !== "updated" && outcome.kind !== "unchanged") {
		return;
	}

	summary.notes += 1;

	if (outcome.kind === "updated") {
		summary.updated += 1;
	}

	for (const failure of outcome.failures) {
		summary.failures.push(`${outcome.note.name}: ${failure}`);
	}
}

/** The notice shown for a run over every note of the image folders. */
export function describeNotesRun(summary: NotesRunSummary): string {
	if (summary.notes === 0) {
		return "There are no notes in the image folders.";
	}

	const notes = `${summary.notes} ${summary.notes === 1 ? "note" : "notes"}`;
	const headline = `Image notes: ${summary.updated} of ${notes} updated.`;

	return lines(headline, ...summary.failures);
}
