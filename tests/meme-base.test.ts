import { describe, expect, it } from "vitest";

import { groupMemeTags, normalizeTag } from "../src/meme-base/tags";
import {
	describeMemeBaseRun,
	filtersOfGroup,
	rebuildMemeBaseViews,
	type MemeBaseOutcome,
} from "../src/meme-base/base";
import { DEFAULT_SETTINGS, normalizeVaultPath, readSettings } from "../src/settings/settings";

/** A base file of one view, the one the generated views are cut from. */
function baseOfOneView(): Record<string, unknown> {
	return {
		filters: { and: ['file.ext == "md"', 'file.folder == "Memes"'] },
		formulas: { preview: "image(file.embeds[0])" },
		views: [
			{
				type: "cards",
				name: "All",
				order: ["file.name"],
				sort: [{ property: "timestamp", direction: "DESC" }],
				image: "formula.preview",
				cardSize: 350,
			},
		],
	};
}

/** The views of a rebuilt base, or a failure of the test that asked for them. */
function viewsOf(base: unknown, topTag: string, groups: Parameters<typeof rebuildMemeBaseViews>[2]) {
	const rebuilt = rebuildMemeBaseViews(base, topTag, groups);

	if (rebuilt.kind !== "rebuilt") {
		throw new Error("the base was not rebuilt");
	}

	return { views: rebuilt.base.views as Record<string, unknown>[], rebuilt };
}

describe("normalizeTag", () => {
	it("keeps a plain tag", () => {
		expect(normalizeTag("Memes/Funny")).toBe("Memes/Funny");
	});

	it("drops the leading hash and surrounding whitespace", () => {
		expect(normalizeTag("  #Memes  ")).toBe("Memes");
	});

	it("collapses repeated separators and trims them", () => {
		expect(normalizeTag("/Memes//Funny/")).toBe("Memes/Funny");
	});

	it("turns a tag that names nothing into an empty string", () => {
		expect(normalizeTag("   ")).toBe("");
		expect(normalizeTag("#")).toBe("");
		expect(normalizeTag("/")).toBe("");
	});
});

describe("groupMemeTags", () => {
	it("makes one group per tag below the top-level one", () => {
		const { groups, notes } = groupMemeTags("Memes", [
			["Memes/Funny"],
			["Memes/Funny"],
			["Memes/Work"],
		]);

		expect(notes).toBe(3);
		expect(groups).toEqual([
			{ name: "Funny", tag: "Memes/Funny", notes: 2 },
			{ name: "Work", tag: "Memes/Work", notes: 1 },
		]);
	});

	it("counts a note of two tags in both of their groups", () => {
		const { groups, notes } = groupMemeTags("Memes", [["Memes/Funny", "Memes/Work"]]);

		expect(notes).toBe(1);
		expect(groups.map((group) => group.notes)).toEqual([1, 1]);
	});

	it("leaves the tags of other trees out of the groups", () => {
		const { groups } = groupMemeTags("Memes", [["Memes/Funny", "Media/Batman", "Topics/AI"]]);

		expect(groups).toEqual([{ name: "Funny", tag: "Memes/Funny", notes: 1 }]);
	});

	it("passes over the notes that carry no tag of the tree", () => {
		const { groups, notes } = groupMemeTags("Memes", [["Media/Batman"], [], ["Memesque"]]);

		expect(notes).toBe(0);
		expect(groups).toEqual([]);
	});

	it("gathers the notes that carry the top-level tag alone in one group", () => {
		const { groups, notes } = groupMemeTags("Memes", [
			["Memes", "Topics/AI"],
			["Memes"],
			["Memes/Funny"],
		]);

		expect(notes).toBe(3);
		expect(groups).toEqual([
			{ name: "Funny", tag: "Memes/Funny", notes: 1 },
			{ name: "Memes", tag: null, notes: 2 },
		]);
	});

	it("keeps the leftovers last, however many of them there are", () => {
		const { groups } = groupMemeTags("Memes", [["Memes"], ["Memes"], ["Memes/Funny"]]);

		expect(groups.map((group) => group.name)).toEqual(["Funny", "Memes"]);
	});

	it("counts a note carrying the top-level tag and one below it as said about", () => {
		const { groups, notes } = groupMemeTags("Memes", [["Memes", "Memes/Funny"]]);

		expect(notes).toBe(1);
		expect(groups).toEqual([{ name: "Funny", tag: "Memes/Funny", notes: 1 }]);
	});

	it("counts one tag written in two ways as one group, whatever the case of the top-level one", () => {
		const { groups } = groupMemeTags("MEMES", [["Memes/Funny"], ["memes/funny"]]);

		expect(groups).toEqual([{ name: "Funny", tag: "Memes/Funny", notes: 2 }]);
	});

	it("counts a tag repeated in one note once", () => {
		const { groups } = groupMemeTags("Memes", [["Memes/Funny", "#Memes/Funny"]]);

		expect(groups).toEqual([{ name: "Funny", tag: "Memes/Funny", notes: 1 }]);
	});

	it("takes the deeper tags as they are", () => {
		const { groups } = groupMemeTags("Memes", [["Memes/Funny/Cats"]]);

		expect(groups).toEqual([{ name: "Funny/Cats", tag: "Memes/Funny/Cats", notes: 1 }]);
	});

	it("shows the larger group first, ties settled by name", () => {
		const { groups } = groupMemeTags("Memes", [
			["Memes/Work"],
			["Memes/Anger"],
			["Memes/Anger"],
			["Memes/Calm"],
		]);

		expect(groups.map((group) => group.name)).toEqual(["Anger", "Calm", "Work"]);
	});

	it("has nothing to group without a tag to group under", () => {
		expect(groupMemeTags("  ", [["Memes/Funny"]])).toEqual({ groups: [], notes: 0 });
	});
});

describe("filtersOfGroup", () => {
	it("filters a group by the tag of the group", () => {
		expect(filtersOfGroup("Memes", { name: "Funny", tag: "Memes/Funny", notes: 1 })).toEqual({
			and: ['file.hasTag("Memes/Funny")'],
		});
	});

	it("filters the leftovers by the top-level tag and nothing below it", () => {
		expect(filtersOfGroup("Memes", { name: "Memes", tag: null, notes: 1 })).toEqual({
			and: [
				'file.hasTag("Memes")',
				'file.tags.filter(value.startsWith("Memes/")).isEmpty()',
			],
		});
	});
});

describe("rebuildMemeBaseViews", () => {
	const groups = [
		{ name: "Funny", tag: "Memes/Funny", notes: 2 },
		{ name: "Memes", tag: null, notes: 1 },
	];

	it("leaves the header and the first view of the file as they are", () => {
		const base = baseOfOneView();
		const { views, rebuilt } = viewsOf(base, "Memes", groups);

		expect(rebuilt.base.filters).toEqual(base.filters);
		expect(rebuilt.base.formulas).toEqual(base.formulas);
		expect(views[0]).toEqual((base.views as unknown[])[0]);
	});

	it("writes one view per group after the first one", () => {
		const { views, rebuilt } = viewsOf(baseOfOneView(), "Memes", groups);

		expect(rebuilt.views).toBe(2);
		expect(views).toHaveLength(3);
		expect(views[1].name).toBe("Funny");
		expect(views[1].filters).toEqual({ and: ['file.hasTag("Memes/Funny")'] });
		expect(views[2].name).toBe("Memes");
	});

	it("cuts a generated view from the first one, its filter aside", () => {
		const { views } = viewsOf(baseOfOneView(), "Memes", groups);

		expect(views[1].type).toBe("cards");
		expect(views[1].image).toBe("formula.preview");
		expect(views[1].cardSize).toBe(350);
		expect(views[1].sort).toEqual(views[0].sort);
		expect(views[1].order).toEqual(views[0].order);
	});

	it("says the name and the filter of a view where the first one says its name", () => {
		const { views } = viewsOf(baseOfOneView(), "Memes", groups);

		expect(Object.keys(views[1])).toEqual([
			"type",
			"name",
			"filters",
			"order",
			"sort",
			"image",
			"cardSize",
		]);
	});

	it("gives every view values of its own", () => {
		const { views } = viewsOf(baseOfOneView(), "Memes", groups);

		expect(views[1].sort).not.toBe(views[0].sort);
		expect(views[2].sort).not.toBe(views[1].sort);
	});

	it("replaces the views of an earlier run", () => {
		const once = viewsOf(baseOfOneView(), "Memes", groups);
		const twice = viewsOf(once.rebuilt.base, "Memes", [groups[0]]);

		expect(twice.views.map((view) => view.name)).toEqual(["All", "Funny"]);
	});

	it("keeps the filter of the first view out of the generated ones", () => {
		const base = baseOfOneView();
		const first = base.views as Record<string, unknown>[];

		first[0].filters = { and: ['file.hasTag("Memes")'] };

		const { views } = viewsOf(base, "Memes", [groups[0]]);

		expect(views[1].filters).toEqual({ and: ['file.hasTag("Memes/Funny")'] });
	});

	it("leaves a file without a view alone", () => {
		expect(rebuildMemeBaseViews({ views: [] }, "Memes", groups)).toEqual({ kind: "no-views" });
		expect(rebuildMemeBaseViews({}, "Memes", groups)).toEqual({ kind: "no-views" });
		expect(rebuildMemeBaseViews(null, "Memes", groups)).toEqual({ kind: "no-views" });
		expect(rebuildMemeBaseViews("views", "Memes", groups)).toEqual({ kind: "no-views" });
	});
});

describe("describeMemeBaseRun", () => {
	const lineOf = (outcome: MemeBaseOutcome): string => describeMemeBaseRun(outcome);

	it("asks for the settings that are missing", () => {
		expect(lineOf({ kind: "no-file" })).toContain("No base of the memes is set");
		expect(lineOf({ kind: "no-tag" })).toContain("No tag of the memes is set");
	});

	it("names the file it could not work with", () => {
		expect(lineOf({ kind: "no-base", path: "Memes.base" })).toContain('"Memes.base"');
		expect(lineOf({ kind: "unreadable", path: "Memes.base", problem: "bad line" })).toContain(
			"bad line",
		);
		expect(lineOf({ kind: "no-views", path: "Memes.base" })).toContain("no view");
	});

	it("says when no note carries the tag", () => {
		expect(lineOf({ kind: "no-notes", path: "Memes.base", tag: "Memes" })).toBe(
			'No note of the vault carries the tag "Memes".',
		);
	});

	it("counts the views and the notes of a run", () => {
		expect(lineOf({ kind: "written", path: "Memes.base", views: 38, notes: 2579 })).toBe(
			'Rebuilt "Memes.base": 38 views over 2579 notes.',
		);
		expect(lineOf({ kind: "unchanged", path: "Memes.base", views: 1, notes: 1 })).toBe(
			'Nothing to change in "Memes.base": 1 view over 1 note.',
		);
	});
});

describe("normalizeVaultPath", () => {
	it("trims a path down to a vault-relative one", () => {
		expect(normalizeVaultPath("  /Resources//Memes.base/ ")).toBe("Resources/Memes.base");
	});
});

describe("readSettings", () => {
	it("starts a fresh installation without a base of the memes", () => {
		expect(readSettings(null).memeBase).toEqual(DEFAULT_SETTINGS.memeBase);
	});

	it("reads the base of the memes back as it was stored", () => {
		expect(readSettings({ memeBase: { file: "Memes.base", tag: "Memes" } }).memeBase).toEqual({
			file: "Memes.base",
			tag: "Memes",
		});
	});

	it("falls back on anything stored in the wrong shape", () => {
		expect(readSettings({ memeBase: { file: 7, tag: null } }).memeBase).toEqual({
			file: "",
			tag: "",
		});
	});
});
