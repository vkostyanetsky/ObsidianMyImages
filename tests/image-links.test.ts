import { describe, expect, it } from "vitest";

import { applyTextEdits } from "../src/markdown/edits";
import { findImageEmbeds } from "../src/images/links";
import {
	buildImageName,
	buildRenamePlan,
	collectLinkEdits,
	findRenameConflict,
	formatImageNumber,
} from "../src/images/plan";
import { fileExtension, parentPath, resolveRelativePath } from "../src/images/paths";
import type { ResolvedEmbed } from "../src/images/types";

/** The paths of the embeds of a note, in order of appearance. */
function embedPaths(source: string): string[] {
	return findImageEmbeds(source).map((embed) => embed.path);
}

/** Resolves every embed against a flat list of vault paths, as the vault would. */
function resolveAgainst(source: string, files: string[]): ResolvedEmbed[] {
	return findImageEmbeds(source).map((embed) => {
		const path = files.filter(
			(candidate) => candidate === embed.path || candidate.endsWith(`/${embed.path}`),
		)[0];

		return {
			embed,
			file: path === undefined ? null : { path, extension: fileExtension(path) },
		};
	});
}

describe("findImageEmbeds", () => {
	it("finds wikilink embeds in order of appearance", () => {
		expect(embedPaths("![[b.png]]\n\ntext\n\n![[a.jpg]]\n")).toEqual(["b.png", "a.jpg"]);
	});

	it("keeps the folder of a path and drops the alias, the size and the subpath", () => {
		expect(embedPaths("![[Folder/Image.png]] ![[a.png|300]] ![[b.png|Caption]] ![[c.png#x]]")).toEqual([
			"Folder/Image.png",
			"a.png",
			"b.png",
			"c.png",
		]);
	});

	it("recognises every image extension regardless of case", () => {
		const source = "![[a.PNG]]![[b.jpeg]]![[c.GIF]]![[d.webp]]![[e.bmp]]![[f.svg]]![[g.avif]]![[h.JPG]]";

		expect(embedPaths(source)).toHaveLength(8);
	});

	it("ignores embeds of files that are not images", () => {
		expect(embedPaths("![[Note]] ![[Note.md]] ![[Sheet.pdf]] ![[Song.mp3]]")).toEqual([]);
	});

	it("ignores plain links and external addresses", () => {
		const source = "[[a.png]] [b](c.png) ![](https://example.com/d.png) ![[http://e.com/f.png]]";

		expect(embedPaths(source)).toEqual([]);
	});

	it("ignores embeds inside fenced code blocks and inline code", () => {
		const source = [
			"![[real.png]]",
			"",
			"```markdown",
			"![[fenced.png]]",
			"```",
			"",
			"`![[inline.png]]` and ``![[double.png]]`` stay code",
			"",
			"![[second.png]]",
		].join("\n");

		expect(embedPaths(source)).toEqual(["real.png", "second.png"]);
	});

	it("ignores embeds inside YAML frontmatter", () => {
		const source = ["---", "cover: ![[front.png]]", "---", "", "![[body.png]]"].join("\n");

		expect(embedPaths(source)).toEqual(["body.png"]);
	});

	it("reads Markdown embeds, including titles, angle brackets and escapes", () => {
		const source = [
			'![alt](Pasted%20image.png "A title")',
			"![](<Folder/With spaces.png>)",
			"![alt](Folder/plain.png)",
		].join("\n");

		expect(embedPaths(source)).toEqual([
			"Pasted image.png",
			"Folder/With spaces.png",
			"Folder/plain.png",
		]);
	});

	it("reports the offsets of the path alone", () => {
		const source = "![[Folder/Image.png|300]]";
		const embed = findImageEmbeds(source)[0];

		expect(source.slice(embed.pathStart, embed.pathEnd)).toBe("Folder/Image.png");
	});
});

describe("formatImageNumber", () => {
	it("uses as many digits as the total has", () => {
		expect(formatImageNumber(1, 9)).toBe("1");
		expect(formatImageNumber(9, 9)).toBe("9");
		expect(formatImageNumber(1, 10)).toBe("01");
		expect(formatImageNumber(10, 10)).toBe("10");
		expect(formatImageNumber(1, 100)).toBe("001");
		expect(formatImageNumber(100, 100)).toBe("100");
	});
});

describe("buildImageName", () => {
	it("keeps the extension and its case", () => {
		expect(buildImageName("Test", 3, 11, "JPG")).toBe("Test 03.JPG");
		expect(buildImageName("My note", 2, 2, "png")).toBe("My note 2.png");
	});

	it("gives a lone image the name of the note, without a number", () => {
		expect(buildImageName("My note", 1, 1, "png")).toBe("My note.png");
		expect(buildImageName("My note", 1, 1, "")).toBe("My note");
	});
});

describe("buildRenamePlan", () => {
	it("numbers unique images by first appearance and keeps their folder", () => {
		const source = "![[Folder/b.png]] ![[a.jpg]] ![[Folder/b.png]] ![[missing.png]]";
		const plan = buildRenamePlan("Test", resolveAgainst(source, ["Folder/b.png", "a.jpg"]));

		expect(plan.entries).toEqual([
			{ file: { path: "Folder/b.png", extension: "png" }, targetPath: "Folder/Test 1.png" },
			{ file: { path: "a.jpg", extension: "jpg" }, targetPath: "Test 2.jpg" },
		]);
		expect(plan.unresolved).toBe(1);
		expect(plan.shared).toBe(0);
	});

	it("leaves out an image other notes use, and does not spend a number on it", () => {
		const source = "![[a.png]] ![[shared.png]] ![[b.png]]";
		const resolved = resolveAgainst(source, ["a.png", "shared.png", "b.png"]);
		const plan = buildRenamePlan("Test", resolved, (path) => path === "shared.png");

		expect(plan.entries).toEqual([
			{ file: { path: "a.png", extension: "png" }, targetPath: "Test 1.png" },
			{ file: { path: "b.png", extension: "png" }, targetPath: "Test 2.png" },
		]);
		expect(plan.shared).toBe(1);
	});

	it("counts an image other notes use once, however often the note shows it", () => {
		const source = "![[shared.png]] ![[shared.png]]";
		const resolved = resolveAgainst(source, ["shared.png"]);
		const plan = buildRenamePlan("Test", resolved, () => true);

		expect(plan.entries).toEqual([]);
		expect(plan.shared).toBe(1);
	});
});

describe("findRenameConflict", () => {
	const entries = [
		{ file: { path: "a.png", extension: "png" }, targetPath: "Test 1.png" },
		{ file: { path: "b.png", extension: "png" }, targetPath: "Test 2.png" },
	];

	it("accepts a plan whose targets are free", () => {
		expect(findRenameConflict(entries, (path) => path === "Other.png")).toBeNull();
	});

	it("accepts a plan whose images take names from each other", () => {
		const swapping = [
			{ file: { path: "Test 2.png", extension: "png" }, targetPath: "Test 1.png" },
			{ file: { path: "Test 1.png", extension: "png" }, targetPath: "Test 2.png" },
		];

		expect(findRenameConflict(swapping, () => true)).toBeNull();
	});

	it("reports the image whose target is taken by a file outside the plan", () => {
		expect(findRenameConflict(entries, (path) => path === "Test 2.png")).toEqual({
			file: { path: "b.png", extension: "png" },
			targetPath: "Test 2.png",
		});
	});
});

describe("collectLinkEdits", () => {
	it("rewrites the file name only, keeping folder, alias and size", () => {
		const source = "![[Folder/old.png|300]] ![[other.png|A caption]]";
		const resolved = resolveAgainst(source, ["Folder/old.png", "other.png"]);
		const plan = buildRenamePlan("Test", resolved);

		expect(applyTextEdits(source, collectLinkEdits(resolved, plan.entries))).toBe(
			"![[Folder/Test 1.png|300]] ![[Test 2.png|A caption]]",
		);
	});

	it("rewrites every link to a file that appears more than once", () => {
		const source = "![[a.png]]\n![[b.png]]\n![[a.png]]\n";
		const resolved = resolveAgainst(source, ["a.png", "b.png"]);
		const plan = buildRenamePlan("Test", resolved);

		expect(applyTextEdits(source, collectLinkEdits(resolved, plan.entries))).toBe(
			"![[Test 1.png]]\n![[Test 2.png]]\n![[Test 1.png]]\n",
		);
	});

	it("percent-encodes the name of a Markdown link and keeps its title", () => {
		const source = '![alt](Folder/old.png "Title") ![](other.png)';
		const resolved = resolveAgainst(source, ["Folder/old.png", "other.png"]);
		const plan = buildRenamePlan("Test", resolved);

		expect(applyTextEdits(source, collectLinkEdits(resolved, plan.entries))).toBe(
			'![alt](Folder/Test%201.png "Title") ![](Test%202.png)',
		);
	});

	it("leaves a link that already spells the right name alone", () => {
		const source = "![[Test.png]]";
		const resolved = resolveAgainst(source, ["Test.png"]);

		expect(collectLinkEdits(resolved, buildRenamePlan("Test", resolved).entries)).toEqual([]);
	});
});

describe("path helpers", () => {
	it("splits vault paths", () => {
		expect(parentPath("a/b/c.png")).toBe("a/b");
		expect(parentPath("c.png")).toBe("");
		expect(fileExtension("a/b/c.tar.PNG")).toBe("PNG");
		expect(fileExtension("a/b/noext")).toBe("");
	});

	it("resolves relative link paths against the folder of a note", () => {
		expect(resolveRelativePath("Notes", "../Images/a.png")).toBe("Images/a.png");
		expect(resolveRelativePath("Notes", "./a.png")).toBe("Notes/a.png");
		expect(resolveRelativePath("", "a.png")).toBe("a.png");
	});
});
