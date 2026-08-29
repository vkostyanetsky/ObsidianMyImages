import { MarkdownView, Notice, Plugin } from "obsidian";

import type { ImageNote, NoteRule } from "./image-notes/rules";
import { describeNoteOutcome, describeNotesRun, updateNote } from "./image-notes/rules";
import { imageNoteOf, updateNotesInFolders } from "./image-notes/run";
import { createRenameImagesRule } from "./images/rule";
import type { MyImagesSettings } from "./settings/settings";
import { hasFolders, readSettings } from "./settings/settings";
import { MyImagesSettingTab } from "./settings/tab";
import { createTweetDateRule } from "./tweets/rule";

/** How long the summary of a run over many notes stays on screen. */
const SUMMARY_NOTICE_DURATION = 10_000;

export default class MyImagesPlugin extends Plugin {
	settings: MyImagesSettings = readSettings(null);

	async onload(): Promise<void> {
		this.settings = readSettings(await this.loadData());

		// The command is not offered at all unless the note in front of the user
		// is one of those the rules are meant for.
		this.addCommand({
			id: "update-image-note",
			name: "Update current note",
			checkCallback: (checking) => {
				const note = this.activeImageNote();

				if (note === null) {
					return false;
				}

				if (!checking) {
					void this.updateImageNote(note);
				}

				return true;
			},
		});

		this.addCommand({
			id: "update-image-notes",
			name: "Update notes in image folders",
			callback: () => {
				void this.updateImageNotes();
			},
		});

		this.addSettingTab(new MyImagesSettingTab(this.app, this));

		// The only run that is not asked for by hand: the image folders are
		// brought up to date with whatever was written while the vault was
		// closed. Nothing is watched afterwards, so a note is only ever touched
		// on demand.
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.imageNotes.autoUpdate) {
				void this.updateImageNotes(true);
			}
		});
	}

	/** Writes the settings back, so that they survive a restart. */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * The rules that are switched on, in the order they are applied in. A new
	 * one is added here and nowhere else.
	 */
	private rules(): NoteRule[] {
		return [
			createRenameImagesRule(this.app, this.settings),
			createTweetDateRule(this.app, this.settings),
		].filter((rule): rule is NoteRule => rule !== null);
	}

	/**
	 * The note in front of the user, but only when it sits in one of the image
	 * folders. Anything else is not a note the rules are meant for, and the
	 * command that works on one is not offered for it.
	 */
	private activeImageNote(): ImageNote | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (view === null || view.file === null) {
			return null;
		}

		return imageNoteOf(view.file, this.settings.imageNotes.folders);
	}

	/** Applies every rule that is switched on to one note. */
	private async updateImageNote(note: ImageNote): Promise<void> {
		new Notice(describeNoteOutcome(await updateNote(this.rules(), note)));
	}

	/**
	 * Does the same for every note of the image folders. A quiet run only speaks
	 * up when something was written or went wrong.
	 */
	private async updateImageNotes(quiet = false): Promise<void> {
		const rules = this.rules();

		if (rules.length === 0) {
			if (!quiet) {
				new Notice(describeNoteOutcome({ kind: "no-rules" }));
			}

			return;
		}

		if (!hasFolders(this.settings.imageNotes.folders)) {
			if (!quiet) {
				new Notice("No image folders are set. Add one in the settings of the plugin.");
			}

			return;
		}

		const summary = await updateNotesInFolders(
			this.app,
			this.settings.imageNotes.folders,
			rules,
		);

		if (quiet && summary.updated === 0 && summary.failures.length === 0) {
			return;
		}

		new Notice(describeNotesRun(summary), SUMMARY_NOTICE_DURATION);
	}
}
