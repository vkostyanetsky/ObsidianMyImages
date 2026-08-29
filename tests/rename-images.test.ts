import { describe, expect, it } from "vitest";

import { applyTextEdits } from "../src/markdown/edits";
import { fileExtension, fileName } from "../src/images/paths";
import {
	describeOutcome,
	renameNoteImages,
	type ImageRenameHost,
	type ImageRenameOutcome,
} from "../src/images/rename";
import type { TextEdit } from "../src/markdown/edits";
import type { VaultFile } from "../src/images/types";

interface VaultOptions {
	/** Name of the note, without its extension. */
	noteName?: string;
	/** Content of the note. */
	source: string;
	/** Every file of the vault, as vault-relative paths. */
	files: string[];
	/** Renaming this file fails, standing in for a vault error. */
	failOn?: string;
	/** Whether the vault rewrites the internal links of the note by itself. */
	autoUpdateLinks?: boolean;
	/** Images that other notes link to as well, by vault path. */
	sharedImages?: string[];
}

/** An in-memory stand-in for the vault the command runs against. */
class FakeVault implements ImageRenameHost {
	readonly noteName: string;
	source: string;
	files: string[];
	readonly renames: string[] = [];
	private readonly failOn: string | undefined;
	private readonly autoUpdateLinks: boolean;
	private readonly sharedImages: string[];

	constructor(options: VaultOptions) {
		this.noteName = options.noteName ?? "Test";
		this.source = options.source;
		this.files = [...options.files];
		this.failOn = options.failOn;
		this.autoUpdateLinks = options.autoUpdateLinks ?? false;
		this.sharedImages = options.sharedImages ?? [];
	}

	readNote(): string {
		return this.source;
	}

	/** Matches an exact path first, then the shortest path ending in the link. */
	resolveImage(linkPath: string): VaultFile | null {
		let path: string | undefined;

		if (this.files.indexOf(linkPath) !== -1) {
			path = linkPath;
		} else {
			path = this.files.filter((candidate) => candidate.endsWith(`/${linkPath}`))[0];
		}

		if (path === undefined && linkPath.indexOf("/") === -1) {
			path = this.files.filter((candidate) => fileName(candidate) === linkPath)[0];
		}

		return path === undefined ? null : { path, extension: fileExtension(path) };
	}

	notesUsingImage(path: string): string[] {
		return this.sharedImages.indexOf(path) === -1 ? [] : ["Other note.md"];
	}

	exists(path: string): boolean {
		return this.files.indexOf(path) !== -1;
	}

	renameFile(from: string, to: string): Promise<void> {
		const index = this.files.indexOf(from);

		if (index === -1) {
			return Promise.reject(new Error(`there is no file at "${from}"`));
		}

		if (this.files.indexOf(to) !== -1) {
			return Promise.reject(new Error(`"${to}" is already taken`));
		}

		if (this.failOn !== undefined && (from === this.failOn || to === this.failOn)) {
			return Promise.reject(new Error(`cannot rename "${from}"`));
		}

		this.files[index] = to;
		this.renames.push(`${from} -> ${to}`);

		if (this.autoUpdateLinks) {
			this.source = rewriteWikilinks(this.source, from, to);
		}

		return Promise.resolve();
	}

	updateNote(edits: TextEdit[]): void {
		this.source = applyTextEdits(this.source, edits);
	}
}

/** Mimics the way Obsidian updates internal links when a file is renamed. */
function rewriteWikilinks(source: string, from: string, to: string): string {
	return source.replace(/!\[\[([^\]\n]*)\]\]/g, (match, inner: string) => {
		const alias = inner.indexOf("|");
		const path = alias === -1 ? inner : inner.slice(0, alias);
		const rest = alias === -1 ? "" : inner.slice(alias);

		if (path !== from && fileName(path) !== fileName(from)) {
			return match;
		}

		return `![[${path === from ? to : fileName(to)}${rest}]]`;
	});
}

/** Builds a list of `count` strings. */
function sequence(count: number, build: (index: number) => string): string[] {
	const items: string[] = [];

	for (let index = 0; index < count; index += 1) {
		items.push(build(index));
	}

	return items;
}

/** Runs the command against a fresh vault and returns both the vault and the outcome. */
async function run(options: VaultOptions): Promise<{ vault: FakeVault; outcome: ImageRenameOutcome }> {
	const vault = new FakeVault(options);

	return { vault, outcome: await renameNoteImages(vault) };
}

describe("renameNoteImages", () => {
	it("1. gives a single image the name of the note, without a number", async () => {
		const { vault, outcome } = await run({
			source: "![[Pasted image 20260808172735.png]]\n",
			files: ["Test.md", "Pasted image 20260808172735.png"],
		});

		expect(outcome).toEqual({ kind: "renamed", renamed: 1, skipped: 0, shared: 0 });
		expect(vault.source).toBe("![[Test.png]]\n");
		expect(vault.files).toContain("Test.png");
	});

	it("1a. numbers the images again once a second one turns up", async () => {
		const { vault, outcome } = await run({
			source: "![[Test.png]]\n![[new.png]]\n",
			files: ["Test.md", "Test.png", "new.png"],
		});

		expect(outcome).toEqual({ kind: "renamed", renamed: 2, skipped: 0, shared: 0 });
		expect(vault.source).toBe("![[Test 1.png]]\n![[Test 2.png]]\n");
		expect(vault.files.sort()).toEqual(["Test 1.png", "Test 2.png", "Test.md"].sort());
	});

	it("2. numbers nine images without leading zeros", async () => {
		const names = sequence(9, (index) => `shot-${index}.png`);
		const { vault, outcome } = await run({
			source: names.map((name) => `![[${name}]]`).join("\n\n"),
			files: ["Test.md", ...names],
		});

		expect(outcome).toEqual({ kind: "renamed", renamed: 9, skipped: 0, shared: 0 });
		expect(vault.source).toBe(
			sequence(9, (index) => `![[Test ${index + 1}.png]]`).join("\n\n"),
		);
	});

	it("3. pads numbers once there are ten images or more", async () => {
		const names = sequence(12, (index) => `shot-${index}.png`);
		const { vault } = await run({
			source: names.map((name) => `![[${name}]]`).join("\n"),
			files: ["Test.md", ...names],
		});

		expect(vault.source.split("\n")[0]).toBe("![[Test 01.png]]");
		expect(vault.source.split("\n")[9]).toBe("![[Test 10.png]]");
		expect(vault.source.split("\n")[11]).toBe("![[Test 12.png]]");
	});

	it("3b. renames the example from the specification", async () => {
		const pasted = [
			"Pasted image 20260808172735.png",
			"Pasted image 20260808172738.png",
			"Pasted image 20260808172743.png",
			"Pasted image 20260808172745.png",
			"Pasted image 20260808172748.png",
			"Pasted image 20260808172750.png",
			"Pasted image 20260808172753.png",
			"Pasted image 20260808172756.png",
		];
		const links = [
			"Test 1.png",
			"Test 02.png",
			pasted[0],
			pasted[1],
			"Test 10.png",
			pasted[2],
			pasted[3],
			pasted[4],
			pasted[5],
			pasted[6],
			pasted[7],
		];

		const { vault, outcome } = await run({
			source: `${links.map((name) => `![[${name}]]`).join("\n\n")}\n`,
			files: ["Test.md", ...links],
		});

		expect(vault.source).toBe(
			`${sequence(11, (index) => `![[Test ${String(index + 1).padStart(2, "0")}.png]]`).join("\n\n")}\n`,
		);
		// "Test 02.png" already sits at its position and is left alone.
		expect(outcome).toEqual({ kind: "renamed", renamed: 10, skipped: 0, shared: 0 });
	});

	it("4. leaves an image that already has the right name alone", async () => {
		const { vault, outcome } = await run({
			source: "![[Test.png]]\n",
			files: ["Test.md", "Test.png"],
		});

		expect(outcome).toEqual({ kind: "renamed", renamed: 0, skipped: 0, shared: 0 });
		expect(vault.renames).toEqual([]);
		expect(vault.source).toBe("![[Test.png]]\n");
		expect(describeOutcome(outcome)).toBe("The images are already named correctly.");
	});

	it("5. renames only the images that are out of place", async () => {
		const { vault, outcome } = await run({
			source: "![[Test 1.png]]\n![[other.png]]\n![[Test 3.png]]\n",
			files: ["Test.md", "Test 1.png", "other.png", "Test 3.png"],
		});

		expect(outcome).toEqual({ kind: "renamed", renamed: 1, skipped: 0, shared: 0 });
		expect(vault.source).toBe("![[Test 1.png]]\n![[Test 2.png]]\n![[Test 3.png]]\n");
	});

	it("6. keeps the extension of every image, including its case", async () => {
		const { vault } = await run({
			source: "![[a.png]] ![[b.JPG]] ![[c.jpeg]] ![[d.svg]]",
			files: ["Test.md", "a.png", "b.JPG", "c.jpeg", "d.svg"],
		});

		expect(vault.source).toBe("![[Test 1.png]] ![[Test 2.JPG]] ![[Test 3.jpeg]] ![[Test 4.svg]]");
		expect(vault.files).toEqual(["Test.md", "Test 1.png", "Test 2.JPG", "Test 3.jpeg", "Test 4.svg"]);
	});

	it("7. keeps an image in its subfolder", async () => {
		const { vault } = await run({
			source: "![[Images/a.png]]\n![[Images/Nested/b.png]]\n",
			files: ["Test.md", "Images/a.png", "Images/Nested/b.png"],
		});

		expect(vault.source).toBe("![[Images/Test 1.png]]\n![[Images/Nested/Test 2.png]]\n");
		expect(vault.files).toContain("Images/Test 1.png");
		expect(vault.files).toContain("Images/Nested/Test 2.png");
	});

	it("8. keeps the alias and the size of a link", async () => {
		const { vault } = await run({
			source: "![[a.png|300]]\n![[b.png|A caption]]\n![[c.png|300x200]]\n",
			files: ["Test.md", "a.png", "b.png", "c.png"],
		});

		expect(vault.source).toBe(
			"![[Test 1.png|300]]\n![[Test 2.png|A caption]]\n![[Test 3.png|300x200]]\n",
		);
	});

	it("9. counts an image that appears several times only once", async () => {
		const { vault, outcome } = await run({
			source: "![[a.png]]\n![[b.png]]\n![[a.png|300]]\n![[b.png]]\n",
			files: ["Test.md", "a.png", "b.png"],
		});

		expect(outcome).toEqual({ kind: "renamed", renamed: 2, skipped: 0, shared: 0 });
		expect(vault.source).toBe(
			"![[Test 1.png]]\n![[Test 2.png]]\n![[Test 1.png|300]]\n![[Test 2.png]]\n",
		);
	});

	it("10. skips a link that does not resolve and gives it no number", async () => {
		const { vault, outcome } = await run({
			source: "![[a.png]]\n![[gone.png]]\n![[b.png]]\n",
			files: ["Test.md", "a.png", "b.png"],
		});

		expect(outcome).toEqual({ kind: "renamed", renamed: 2, skipped: 1, shared: 0 });
		expect(vault.source).toBe("![[Test 1.png]]\n![[gone.png]]\n![[Test 2.png]]\n");
		expect(describeOutcome(outcome)).toBe("Renamed 2 images, skipped 1 unresolved link.");
	});

	it("11. changes nothing when a target name is taken by another file", async () => {
		const { vault, outcome } = await run({
			source: "![[a.png]]\n![[b.png]]\n",
			files: ["Test.md", "a.png", "b.png", "Test 2.png"],
		});

		expect(outcome).toEqual({ kind: "conflict", path: "Test 2.png", from: "b.png" });
		expect(vault.renames).toEqual([]);
		expect(vault.files).toEqual(["Test.md", "a.png", "b.png", "Test 2.png"]);
		expect(vault.source).toBe("![[a.png]]\n![[b.png]]\n");
		expect(describeOutcome(outcome)).toBe(
			'Nothing was renamed: "b.png" cannot become "Test 2.png", which another file of ' +
				"the folder already carries. That file is not embedded in this note.",
		);
	});

	it("12. swaps names among the images of the note", async () => {
		const { vault, outcome } = await run({
			source: "![[Test 2.png]]\n![[Test 1.png]]\n",
			files: ["Test.md", "Test 1.png", "Test 2.png"],
		});

		expect(outcome).toEqual({ kind: "renamed", renamed: 2, skipped: 0, shared: 0 });
		expect(vault.source).toBe("![[Test 1.png]]\n![[Test 2.png]]\n");
		expect(vault.files.slice(1).sort()).toEqual(["Test 1.png", "Test 2.png"]);
		// Only one of the two has to move aside for the other to pass.
		expect(vault.renames).toHaveLength(3);
		expect(vault.renames.filter((rename) => rename.includes("renaming-image"))).toHaveLength(2);
	});

	it("12a. renames straight to the new name when nothing is in the way", async () => {
		const { vault } = await run({
			source: "![[a.png]]\n![[b.png]]\n",
			files: ["Test.md", "a.png", "b.png"],
		});

		expect(vault.renames).toEqual(["a.png -> Test 1.png", "b.png -> Test 2.png"]);
	});

	it("12b. shifts a whole run of names by one", async () => {
		const { vault } = await run({
			source: "![[new.png]]\n![[Test 1.png]]\n![[Test 2.png]]\n",
			files: ["Test.md", "new.png", "Test 1.png", "Test 2.png"],
		});

		expect(vault.source).toBe("![[Test 1.png]]\n![[Test 2.png]]\n![[Test 3.png]]\n");
		expect(vault.files.slice(1).sort()).toEqual(["Test 1.png", "Test 2.png", "Test 3.png"]);
	});

	it("13. ignores links inside code blocks and inline code", async () => {
		const source = [
			"![[a.png]]",
			"",
			"```markdown",
			"![[b.png]]",
			"```",
			"",
			"`![[b.png]]`",
			"",
			"![[c.png]]",
		].join("\n");

		const { vault, outcome } = await run({
			source,
			files: ["Test.md", "a.png", "b.png", "c.png"],
		});

		expect(outcome).toEqual({ kind: "renamed", renamed: 2, skipped: 0, shared: 0 });
		expect(vault.source).toBe(
			[
				"![[Test 1.png]]",
				"",
				"```markdown",
				"![[b.png]]",
				"```",
				"",
				"`![[b.png]]`",
				"",
				"![[Test 2.png]]",
			].join("\n"),
		);
		expect(vault.files).toContain("b.png");
	});

	it("14. reports a note without images", async () => {
		const { vault, outcome } = await run({
			source: "# Test\n\nJust text, and `![[code.png]]` in code.\n",
			files: ["Test.md", "code.png"],
		});

		expect(outcome).toEqual({ kind: "no-images" });
		expect(vault.renames).toEqual([]);
		expect(describeOutcome(outcome)).toBe("No images are embedded in the current note.");
	});

	it("15. reports a missing note", async () => {
		const outcome = await renameNoteImages(null);

		expect(outcome).toEqual({ kind: "no-note" });
		expect(describeOutcome(outcome)).toBe("No active Markdown note.");
	});

	it("keeps everything else of the note untouched", async () => {
		const source = [
			"---",
			"title: Test",
			"cover: ![[front.png]]",
			"---",
			"",
			"# Heading",
			"",
			"  Indented text with  double  spaces.",
			"",
			"![[a.png]]",
			"",
			"| a | b |",
			"| - | - |",
			"",
			"![[b.png|300]]\r\n",
		].join("\n");

		const { vault } = await run({ source, files: ["Test.md", "front.png", "a.png", "b.png"] });

		expect(vault.source).toBe(
			source.replace("![[a.png]]", "![[Test 1.png]]").replace("![[b.png|300]]", "![[Test 2.png|300]]"),
		);
	});

	it("renames Markdown links and percent-encodes the new name", async () => {
		const { vault } = await run({
			source: '![alt](Images/one.png "Title")\n![](<Images/two space.png>)\n',
			files: ["Test.md", "Images/one.png", "Images/two space.png"],
		});

		expect(vault.source).toBe('![alt](Images/Test%201.png "Title")\n![](<Images/Test 2.png>)\n');
		expect(vault.files).toContain("Images/Test 1.png");
		expect(vault.files).toContain("Images/Test 2.png");
	});

	it("leaves the note alone when the vault updates the links itself", async () => {
		const { vault, outcome } = await run({
			source: "![[a.png]]\n![[b.png|300]]\n",
			files: ["Test.md", "a.png", "b.png"],
			autoUpdateLinks: true,
		});

		expect(outcome).toEqual({ kind: "renamed", renamed: 2, skipped: 0, shared: 0 });
		expect(vault.source).toBe("![[Test 1.png]]\n![[Test 2.png|300]]\n");
	});

	it("takes back the renames it already made when one of them fails", async () => {
		const { vault, outcome } = await run({
			source: "![[a.png]]\n![[b.png]]\n![[c.png]]\n",
			files: ["Test.md", "a.png", "b.png", "c.png"],
			failOn: "Test 3.png",
		});

		expect(outcome.kind).toBe("failed");
		expect(vault.files.sort()).toEqual(["Test.md", "a.png", "b.png", "c.png"].sort());
		expect(vault.source).toBe("![[a.png]]\n![[b.png]]\n![[c.png]]\n");
		expect(describeOutcome(outcome)).toContain("Could not rename the images");
	});

	it("reports a note whose every link is broken", async () => {
		const { vault, outcome } = await run({
			source: "![[gone.png]]\n![[missing.png]]\n",
			files: ["Test.md"],
		});

		expect(outcome).toEqual({ kind: "renamed", renamed: 0, skipped: 2, shared: 0 });
		expect(vault.source).toBe("![[gone.png]]\n![[missing.png]]\n");
		expect(describeOutcome(outcome)).toBe(
			"The images are already named correctly, skipped 2 unresolved links.",
		);
	});

	it("names the images after the note they are in", async () => {
		const { vault } = await run({
			noteName: "My holiday",
			source: "![[a.png]]",
			files: ["My holiday.md", "a.png"],
		});

		expect(vault.source).toBe("![[My holiday.png]]");
		expect(vault.files).toContain("My holiday.png");
	});

	it("works with a host that reads and writes the note asynchronously", async () => {
		const vault = new FakeVault({
			source: "![[a.png]]\n![[b.png]]\n",
			files: ["Test.md", "a.png", "b.png"],
		});

		// A note that is not open is read and written through the vault, which
		// only answers with promises.
		const outcome = await renameNoteImages({
			noteName: vault.noteName,
			readNote: () => Promise.resolve(vault.readNote()),
			resolveImage: (linkPath) => vault.resolveImage(linkPath),
			notesUsingImage: (path) => vault.notesUsingImage(path),
			exists: (path) => vault.exists(path),
			renameFile: (from, to) => vault.renameFile(from, to),
			updateNote: (edits) => Promise.resolve(vault.updateNote(edits)),
		});

		expect(outcome).toEqual({ kind: "renamed", renamed: 2, skipped: 0, shared: 0 });
		expect(vault.source).toBe("![[Test 1.png]]\n![[Test 2.png]]\n");
		expect(vault.files.sort()).toEqual(["Test 1.png", "Test 2.png", "Test.md"]);
	});

	it("reports a note that could not be written back", async () => {
		const vault = new FakeVault({
			source: "![[a.png]]\n",
			files: ["Test.md", "a.png"],
		});

		const outcome = await renameNoteImages({
			noteName: vault.noteName,
			readNote: () => Promise.resolve(vault.readNote()),
			resolveImage: (linkPath) => vault.resolveImage(linkPath),
			notesUsingImage: (path) => vault.notesUsingImage(path),
			exists: (path) => vault.exists(path),
			renameFile: (from, to) => vault.renameFile(from, to),
			updateNote: () => Promise.reject(new Error("the note was changed meanwhile")),
		});

		expect(outcome).toEqual({ kind: "failed", message: "the note was changed meanwhile" });

		// The image is back under the name it had.
		expect(vault.files.sort()).toEqual(["Test.md", "a.png"]);
	});

	it("leaves an image that another note uses as well alone", async () => {
		const { vault, outcome } = await run({
			source: "![[a.png]]\n![[b.png]]\n![[c.png]]\n",
			files: ["Test.md", "a.png", "b.png", "c.png"],
			sharedImages: ["b.png"],
		});

		expect(outcome).toEqual({ kind: "renamed", renamed: 2, skipped: 0, shared: 1 });
		expect(vault.source).toBe("![[Test 1.png]]\n![[b.png]]\n![[Test 2.png]]\n");
		expect(vault.files.sort()).toEqual(["Test 1.png", "Test 2.png", "Test.md", "b.png"].sort());
		expect(describeOutcome(outcome)).toBe(
			"Renamed 2 images, skipped 1 image used in other notes.",
		);
	});

	it("says what it left alone when every image belongs to other notes as well", async () => {
		const { vault, outcome } = await run({
			source: "![[a.png]]\n![[gone.png]]\n",
			files: ["Test.md", "a.png"],
			sharedImages: ["a.png"],
		});

		expect(outcome).toEqual({ kind: "renamed", renamed: 0, skipped: 1, shared: 1 });
		expect(vault.source).toBe("![[a.png]]\n![[gone.png]]\n");
		expect(vault.renames).toEqual([]);
		expect(describeOutcome(outcome)).toBe(
			"The images are already named correctly, skipped 1 unresolved link and 1 image used in other notes.",
		);
	});
});
