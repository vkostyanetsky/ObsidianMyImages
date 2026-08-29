import { describe, expect, it } from "vitest";

import {
	hasFolders,
	isInAnyFolder,
	isInFolder,
	isMarkdownPath,
	normalizeFolder,
	readSettings,
	DEFAULT_SETTINGS,
} from "../src/settings/settings";
import {
	addToSummary,
	changed,
	describeNoteOutcome,
	describeNotesRun,
	emptySummary,
	failed,
	unchanged,
	updateNote,
	NOTHING_TO_DO,
	type ImageNote,
	type NoteRule,
	type RuleOutcome,
} from "../src/image-notes/rules";

describe("normalizeFolder", () => {
	it("keeps a plain vault-relative folder", () => {
		expect(normalizeFolder("Projects/Notes")).toBe("Projects/Notes");
	});

	it("drops surrounding whitespace and slashes", () => {
		expect(normalizeFolder("  /Projects/Notes/  ")).toBe("Projects/Notes");
	});

	it("collapses repeated separators", () => {
		expect(normalizeFolder("Projects//Notes")).toBe("Projects/Notes");
	});

	it("turns the vault root into an empty string", () => {
		expect(normalizeFolder("/")).toBe("");
		expect(normalizeFolder("   ")).toBe("");
	});
});

describe("hasFolders", () => {
	it("sees a folder among blank rows", () => {
		expect(hasFolders(["", " ", "Projects"])).toBe(true);
	});

	it("sees none when every row is blank", () => {
		expect(hasFolders([])).toBe(false);
		expect(hasFolders(["", "  ", "/"])).toBe(false);
	});
});

describe("isInFolder", () => {
	it("holds a note of the folder", () => {
		expect(isInFolder("Projects/Note.md", "Projects")).toBe(true);
	});

	it("holds a note of a subfolder", () => {
		expect(isInFolder("Projects/2026/Note.md", "Projects")).toBe(true);
	});

	it("ignores the case of the path", () => {
		expect(isInFolder("projects/Note.md", "Projects")).toBe(true);
	});

	it("does not hold the folder itself, nor a folder that only starts alike", () => {
		expect(isInFolder("Projects", "Projects")).toBe(false);
		expect(isInFolder("Projects Archive/Note.md", "Projects")).toBe(false);
	});

	it("holds nothing when the folder names nothing", () => {
		expect(isInFolder("Note.md", "")).toBe(false);
		expect(isInFolder("Note.md", "/")).toBe(false);
	});

	it("reads the folder as it is written in the settings", () => {
		expect(isInFolder("Projects/Note.md", " /Projects/ ")).toBe(true);
	});
});

describe("isInAnyFolder", () => {
	it("holds a note of one of the folders", () => {
		expect(isInAnyFolder("Notes/Note.md", ["Projects", "Notes"])).toBe(true);
	});

	it("holds nothing when there are no folders", () => {
		expect(isInAnyFolder("Notes/Note.md", [])).toBe(false);
	});
});

describe("isMarkdownPath", () => {
	it("recognises a note, whatever the case of its extension", () => {
		expect(isMarkdownPath("Projects/Note.md")).toBe(true);
		expect(isMarkdownPath("Projects/Note.MD")).toBe(true);
	});

	it("does not recognise anything else", () => {
		expect(isMarkdownPath("Projects/Image.png")).toBe(false);
		expect(isMarkdownPath("Projects/README")).toBe(false);
	});
});

describe("readSettings", () => {
	it("falls back to the defaults when nothing was stored", () => {
		expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(readSettings(undefined)).toEqual(DEFAULT_SETTINGS);
	});

	it("keeps what was stored", () => {
		const stored = {
			imageNotes: {
				folders: ["Projects"],
				autoUpdate: true,
				renameImages: { enabled: false },
				tweetDate: { enabled: true, property: "posted" },
			},
		};

		expect(readSettings(stored)).toEqual({ ...DEFAULT_SETTINGS, ...stored });
	});

	it("leaves out folders that are not paths, and mends a broken flag", () => {
		const settings = readSettings({
			imageNotes: { folders: ["Projects", 7, null], autoUpdate: "yes" },
		});

		expect(settings.imageNotes.folders).toEqual(["Projects"]);
		expect(settings.imageNotes.autoUpdate).toBe(false);
	});

	it("falls back to the default for a date property that names nothing", () => {
		const settings = readSettings({ imageNotes: { tweetDate: { property: "  " } } });

		expect(settings.imageNotes.tweetDate.property).toBe("date");
	});

	it("carries the image folders over from where they used to sit", () => {
		// They were flat at the top while the renaming was the only rule, and an
		// installation set up back then must keep its folders and go on renaming.
		const settings = readSettings({ imageFolders: ["Notes"], autoRenameImages: true });

		expect(settings.imageNotes).toEqual({
			...DEFAULT_SETTINGS.imageNotes,
			folders: ["Notes"],
			autoUpdate: true,
		});
		expect(settings.imageNotes.renameImages.enabled).toBe(true);
		expect(settings.imageNotes.tweetDate.enabled).toBe(false);
	});

	it("does not hand out the default array itself", () => {
		const settings = readSettings({});

		settings.imageNotes.folders.push("Projects");

		expect(DEFAULT_SETTINGS.imageNotes.folders).toEqual([]);
	});
});

describe("a run over one note", () => {
	const note: ImageNote = { path: "Images/Cat.md", name: "Cat" };

	function rule(id: string, outcome: RuleOutcome): NoteRule {
		return { id, apply: () => Promise.resolve(outcome) };
	}

	it("says what every rule did", async () => {
		const outcome = await updateNote(
			[rule("rename", changed("renamed 2 images")), rule("tweet", changed("date 2026-08-29"))],
			note,
		);

		expect(outcome.kind).toBe("updated");
		expect(describeNoteOutcome(outcome)).toBe(
			'Updated "Cat": renamed 2 images; date 2026-08-29.',
		);
	});

	it("says so when the note already reads the way the rules want it", async () => {
		const outcome = await updateNote(
			[
				rule("rename", unchanged("the images are already named correctly")),
				rule("tweet", unchanged("the date is already 2026-08-29")),
			],
			note,
		);

		expect(outcome.kind).toBe("unchanged");
		expect(describeNoteOutcome(outcome)).toBe(
			'Nothing to update in "Cat": the images are already named correctly; ' +
				"the date is already 2026-08-29.",
		);
	});

	it("says so when no rule had anything to do", async () => {
		const outcome = await updateNote([rule("rename", NOTHING_TO_DO)], note);

		expect(describeNoteOutcome(outcome)).toBe('Nothing to update in "Cat".');
	});

	it("applies the rules behind one that failed", async () => {
		const outcome = await updateNote(
			[rule("rename", failed("the vault is busy")), rule("tweet", changed("date 2026-08-29"))],
			note,
		);

		expect(outcome.kind).toBe("updated");
		expect(describeNoteOutcome(outcome)).toBe(
			'Updated "Cat": date 2026-08-29.\nthe vault is busy',
		);
	});

	it("says so when no rule is switched on", async () => {
		const outcome = await updateNote([], note);

		expect(outcome).toEqual({ kind: "no-rules" });
		expect(describeNoteOutcome(outcome)).toBe(
			"Nothing is done to the notes of the image folders. " +
				"Switch a rule on in the settings of the plugin.",
		);
	});
});

describe("a run over several notes", () => {
	async function summaryOf(...notes: [string, RuleOutcome[]][]) {
		const summary = emptySummary();

		for (const [name, outcomes] of notes) {
			const rules = outcomes.map((outcome, index) => ({
				id: `rule-${index}`,
				apply: () => Promise.resolve(outcome),
			}));

			addToSummary(summary, await updateNote(rules, { path: `Images/${name}.md`, name }));
		}

		return summary;
	}

	it("counts the notes that were written", async () => {
		const summary = await summaryOf(
			["First", [changed("renamed 3 images")]],
			["Second", [changed("date 2026-08-29")]],
			["Third", [NOTHING_TO_DO]],
		);

		expect(summary).toEqual({ notes: 3, updated: 2, failures: [] });
		expect(describeNotesRun(summary)).toBe("Image notes: 2 of 3 notes updated.");
	});

	it("keeps the rules that could not be applied, by note", async () => {
		const summary = await summaryOf(
			["First", [changed("renamed 1 image")]],
			["Second", [failed("the vault is busy")]],
		);

		expect(summary.notes).toBe(2);
		expect(summary.updated).toBe(1);
		expect(describeNotesRun(summary)).toBe(
			"Image notes: 1 of 2 notes updated.\nSecond: the vault is busy",
		);
	});

	it("says so when the folders hold no notes", () => {
		expect(describeNotesRun(emptySummary())).toBe("There are no notes in the image folders.");
	});
});
