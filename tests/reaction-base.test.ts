import { describe, expect, it } from "vitest";

import { groupReactionTags, nameOfTag, normalizeTag } from "../src/reaction-base/tags";
import {
	describeReactionBaseRun,
	filtersOfGroup,
	rebuildReactionBaseViews,
	type ReactionBaseOutcome,
} from "../src/reaction-base/base";
import { DEFAULT_SETTINGS, normalizeVaultPath, readSettings } from "../src/settings/settings";

/** A base file of one view, the one the generated views are cut from. */
function baseOfOneView(): Record<string, unknown> {
	return {
		filters: { and: ['file.ext == "md"', 'file.hasTag("Reaction")'] },
		formulas: { preview: "image(file.embeds[0])" },
		views: [
			{
				type: "cards",
				name: "Everything",
				order: ["file.name"],
				sort: [
					{ property: "tags", direction: "ASC" },
					{ property: "timestamp", direction: "DESC" },
				],
				image: "formula.preview",
				cardSize: 350,
			},
		],
	};
}

/** The views of a rebuilt base, or a failure of the test that asked for them. */
function viewsOf(base: unknown, groups: Parameters<typeof rebuildReactionBaseViews>[1]) {
	const rebuilt = rebuildReactionBaseViews(base, groups);

	if (rebuilt.kind !== "rebuilt") {
		throw new Error("the base was not rebuilt");
	}

	return { views: rebuilt.base.views as Record<string, unknown>[], rebuilt };
}

/** The name of the one view that is not a tag, as the settings carry it. */
const EVERYTHING = "Everything";

/** What one base groups its notes by, the first view named unless said so. */
function grouping(tag: string, all = EVERYTHING) {
	return { tag, all };
}

/** One group of one tag, as the grouping hands it over. */
function groupOf(name: string, tag: string, notes: number) {
	return { name, tag, notes };
}

/** The group of every reaction there is, which asks for the top-level tag. */
function groupOfEverything(tag: string, notes: number) {
	return groupOf(EVERYTHING, tag, notes);
}

describe("normalizeTag", () => {
	it("keeps a plain tag", () => {
		expect(normalizeTag("Reaction/Approve")).toBe("Reaction/Approve");
	});

	it("drops the leading hash and surrounding whitespace", () => {
		expect(normalizeTag("  #Reaction  ")).toBe("Reaction");
	});

	it("collapses repeated separators and trims them", () => {
		expect(normalizeTag("/Reaction//Approve/")).toBe("Reaction/Approve");
	});

	it("turns a tag that names nothing into an empty string", () => {
		expect(normalizeTag("   ")).toBe("");
		expect(normalizeTag("#")).toBe("");
		expect(normalizeTag("/")).toBe("");
	});
});

describe("nameOfTag", () => {
	it("takes the top-level tag off the front", () => {
		expect(nameOfTag("Reaction/Approve", "Reaction")).toBe("Approve");
	});

	it("spells out a word that runs into the next one", () => {
		expect(nameOfTag("Реакция/ДоволенСобой", "Реакция")).toBe("Доволен собой");
		expect(nameOfTag("Реакция/НужнаПомощь", "Реакция")).toBe("Нужна помощь");
		expect(nameOfTag("Reaction/SoPleased", "Reaction")).toBe("So pleased");
	});

	it("spells out a name of three words as well", () => {
		expect(nameOfTag("Reaction/OneTwoThree", "Reaction")).toBe("One two three");
	});

	it("leaves an abbreviation as it stands", () => {
		expect(nameOfTag("Реакция/NSFW", "Реакция")).toBe("NSFW");
		expect(nameOfTag("Реакция/3D", "Реакция")).toBe("3D");
	});

	it("leaves a word that runs into an abbreviation unlowered", () => {
		expect(nameOfTag("Reaction/GoodNSFW", "Reaction")).toBe("Good NSFW");
	});

	it("spells out every part of a deeper tag, slash and all", () => {
		expect(nameOfTag("Reaction/GoodOnes/BigCats", "Reaction")).toBe("Good ones/Big cats");
	});
});

describe("groupReactionTags", () => {
	it("makes one group per tag below the top-level one", () => {
		const { groups, notes } = groupReactionTags(grouping("Reaction"), [
			["Reaction/Approve"],
			["Reaction/Approve"],
			["Reaction/Anger"],
		]);

		expect(notes).toBe(3);
		expect(groups).toEqual([
			groupOfEverything("Reaction", 3),
			groupOf("Anger", "Reaction/Anger", 1),
			groupOf("Approve", "Reaction/Approve", 2),
		]);
	});

	it("gathers every reaction there is in the first group", () => {
		const { groups } = groupReactionTags(grouping("Reaction"), [
			["Reaction/Approve"],
			["Reaction/Anger", "Reaction/Funny"],
			["Reaction"],
		]);

		expect(groups[0]).toEqual(groupOfEverything("Reaction", 3));
	});

	it("counts a note of two tags in both of their groups", () => {
		const { groups, notes } = groupReactionTags(grouping("Reaction"), [
			["Reaction/Approve", "Reaction/Funny"],
		]);

		expect(notes).toBe(1);
		expect(groups.slice(1).map((group) => group.notes)).toEqual([1, 1]);
	});

	it("leaves the tags of other trees out of the groups", () => {
		const { groups } = groupReactionTags(grouping("Reaction"), [
			["Reaction/Approve", "Media/Batman", "Topic/AI"],
		]);

		expect(groups).toEqual([
			groupOfEverything("Reaction", 1),
			groupOf("Approve", "Reaction/Approve", 1),
		]);
	});

	it("passes over the notes that carry no tag of the tree", () => {
		const { groups, notes } = groupReactionTags(grouping("Reaction"), [
			["Media/Batman"],
			[],
			["Reactionary"],
		]);

		expect(notes).toBe(0);
		expect(groups).toEqual([]);
	});

	it("counts a note carrying the top-level tag alone among all of them, and nowhere else", () => {
		const { groups, notes } = groupReactionTags(grouping("Reaction"), [
			["Reaction", "Topic/AI"],
			["Reaction"],
			["Reaction/Approve"],
		]);

		expect(notes).toBe(3);
		expect(groups).toEqual([
			groupOfEverything("Reaction", 3),
			groupOf("Approve", "Reaction/Approve", 1),
		]);
	});

	it("counts a note carrying the top-level tag and one below it once", () => {
		const { groups, notes } = groupReactionTags(grouping("Reaction"), [
			["Reaction", "Reaction/Approve"],
		]);

		expect(notes).toBe(1);
		expect(groups).toEqual([
			groupOfEverything("Reaction", 1),
			groupOf("Approve", "Reaction/Approve", 1),
		]);
	});

	it("counts one tag written in two ways as one group, whatever the case of the top-level one", () => {
		const { groups } = groupReactionTags(grouping("REACTION"), [
			["Reaction/Approve"],
			["reaction/approve"],
		]);

		expect(groups).toEqual([
			groupOfEverything("REACTION", 2),
			groupOf("Approve", "Reaction/Approve", 2),
		]);
	});

	it("counts a tag repeated in one note once", () => {
		const { groups } = groupReactionTags(grouping("Reaction"), [
			["Reaction/Approve", "#Reaction/Approve"],
		]);

		expect(groups).toEqual([
			groupOfEverything("Reaction", 1),
			groupOf("Approve", "Reaction/Approve", 1),
		]);
	});

	it("takes the deeper tags as they are", () => {
		const { groups } = groupReactionTags(grouping("Reaction"), [["Reaction/Approve/Loudly"]]);

		expect(groups[1]).toEqual(groupOf("Approve/Loudly", "Reaction/Approve/Loudly", 1));
	});

	it("names a group of a run-together tag as it is read, the tag itself untouched", () => {
		const { groups } = groupReactionTags(grouping("Реакция"), [["Реакция/ДоволенСобой"]]);

		expect(groups[1]).toEqual(groupOf("Доволен собой", "Реакция/ДоволенСобой", 1));
	});

	it("shows the groups after the first one by name, whatever their size", () => {
		const { groups } = groupReactionTags(grouping("Reaction"), [
			["Reaction/Sleepy"],
			["Reaction/Sleepy"],
			["Reaction/Anger"],
			["Reaction/Calm"],
		]);

		expect(groups.map((group) => group.name)).toEqual([
			EVERYTHING,
			"Anger",
			"Calm",
			"Sleepy",
		]);
	});

	it("puts the names in Russian order", () => {
		const { groups } = groupReactionTags(grouping("Реакция"), [
			["Реакция/Работа"],
			["Реакция/Агрессия"],
			["Реакция/Смешное"],
		]);

		expect(groups.map((group) => group.name)).toEqual([
			EVERYTHING,
			"Агрессия",
			"Работа",
			"Смешное",
		]);
	});

	it("has nothing to group without a tag to group under", () => {
		expect(groupReactionTags(grouping("  "), [["Reaction/Approve"]])).toEqual({
			groups: [],
			notes: 0,
		});
	});

	it("makes no group of every reaction when that view is left unnamed", () => {
		const { groups, notes } = groupReactionTags(grouping("Reaction", "  "), [
			["Reaction"],
			["Reaction/Approve"],
		]);

		expect(notes).toBe(2);
		expect(groups.map((group) => group.name)).toEqual(["Approve"]);
	});

	it("has nothing to group at all when the tags are unused and that view is unnamed", () => {
		expect(groupReactionTags(grouping("Reaction", ""), [["Reaction"]]).groups).toEqual([]);
	});

	it("takes the name of that view as it is typed, whitespace aside", () => {
		const { groups } = groupReactionTags(grouping("Реакция", "  Все  "), [["Реакция"]]);

		expect(groups.map((group) => group.name)).toEqual(["Все"]);
	});
});

describe("filtersOfGroup", () => {
	it("filters a group by the tag of the group", () => {
		expect(filtersOfGroup(groupOf("Approve", "Reaction/Approve", 1))).toEqual({
			and: ['file.hasTag("Reaction/Approve")'],
		});
	});

	it("filters every reaction there is by the top-level tag, its own tags counting too", () => {
		expect(filtersOfGroup(groupOfEverything("Reaction", 1))).toEqual({
			and: ['file.hasTag("Reaction")'],
		});
	});
});

describe("rebuildReactionBaseViews", () => {
	const groups = [
		groupOfEverything("Reaction", 3),
		groupOf("Anger", "Reaction/Anger", 1),
		groupOf("Approve", "Reaction/Approve", 2),
	];

	it("leaves the header of the file as it is", () => {
		const base = baseOfOneView();
		const { rebuilt } = viewsOf(base, groups);

		expect(rebuilt.base.filters).toEqual(base.filters);
		expect(rebuilt.base.formulas).toEqual(base.formulas);
	});

	it("writes one view per group, the first of them the one of every reaction", () => {
		const { views, rebuilt } = viewsOf(baseOfOneView(), groups);

		expect(rebuilt.views).toBe(3);
		expect(views.map((view) => view.name)).toEqual([EVERYTHING, "Anger", "Approve"]);
		expect(views[0].filters).toEqual({ and: ['file.hasTag("Reaction")'] });
		expect(views[2].filters).toEqual({ and: ['file.hasTag("Reaction/Approve")'] });
	});

	it("cuts every view from the one the file opened with, name and filter aside", () => {
		const { views } = viewsOf(baseOfOneView(), groups);
		const model = (baseOfOneView().views as Record<string, unknown>[])[0];

		for (const view of views) {
			expect(view.type).toBe(model.type);
			expect(view.image).toBe(model.image);
			expect(view.cardSize).toBe(model.cardSize);
			expect(view.order).toEqual(model.order);
			expect(view.sort).toEqual(model.sort);
		}
	});

	it("says the name and the filter of a view where the model says its name", () => {
		const { views } = viewsOf(baseOfOneView(), groups);

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
		const { views } = viewsOf(baseOfOneView(), groups);

		expect(views[1].sort).not.toBe(views[0].sort);
		expect(views[2].sort).not.toBe(views[1].sort);
	});

	it("replaces the views of an earlier run, the first one included", () => {
		const once = viewsOf(baseOfOneView(), groups);
		const twice = viewsOf(once.rebuilt.base, [groups[0], groups[2]]);

		expect(twice.views.map((view) => view.name)).toEqual([EVERYTHING, "Approve"]);
	});

	it("keeps the filter of the model out of the generated views", () => {
		const base = baseOfOneView();
		const model = base.views as Record<string, unknown>[];

		model[0].filters = { and: ['file.inFolder("Collections")'] };

		const { views } = viewsOf(base, [groups[2]]);

		expect(views[1]).toBeUndefined();
		expect(views[0].filters).toEqual({ and: ['file.hasTag("Reaction/Approve")'] });
	});

	it("leaves a file it could take no view from alone", () => {
		expect(rebuildReactionBaseViews({ views: [] }, groups)).toEqual({ kind: "no-views" });
		expect(rebuildReactionBaseViews({}, groups)).toEqual({ kind: "no-views" });
		expect(rebuildReactionBaseViews(null, groups)).toEqual({ kind: "no-views" });
		expect(rebuildReactionBaseViews("views", groups)).toEqual({ kind: "no-views" });
	});

	it("leaves a file alone when there is no group to write", () => {
		expect(rebuildReactionBaseViews(baseOfOneView(), [])).toEqual({ kind: "no-views" });
	});
});

describe("describeReactionBaseRun", () => {
	const lineOf = (outcome: ReactionBaseOutcome): string => describeReactionBaseRun(outcome);

	it("asks for the settings that are missing", () => {
		expect(lineOf({ kind: "no-file" })).toContain("No reaction base is set");
		expect(lineOf({ kind: "no-tag" })).toContain("No reaction tag is set");
	});

	it("names the file it could not work with", () => {
		expect(lineOf({ kind: "no-base", path: "Reactions.base" })).toContain('"Reactions.base"');
		expect(
			lineOf({ kind: "unreadable", path: "Reactions.base", problem: "bad line" }),
		).toContain("bad line");
		expect(lineOf({ kind: "no-views", path: "Reactions.base" })).toContain("no view");
	});

	it("says when there would be no view to write", () => {
		expect(lineOf({ kind: "no-groups", path: "Reactions.base", tag: "Reaction" })).toContain(
			"no view to write",
		);
	});

	it("says when no note carries the tag", () => {
		expect(lineOf({ kind: "no-notes", path: "Reactions.base", tag: "Reaction" })).toBe(
			'No note of the vault carries the tag "Reaction".',
		);
	});

	it("counts the views and the notes of a run", () => {
		expect(lineOf({ kind: "written", path: "Reactions.base", views: 23, notes: 1655 })).toBe(
			'Rebuilt "Reactions.base": 23 views over 1655 notes.',
		);
		expect(lineOf({ kind: "unchanged", path: "Reactions.base", views: 1, notes: 1 })).toBe(
			'Nothing to change in "Reactions.base": 1 view over 1 note.',
		);
	});
});

describe("normalizeVaultPath", () => {
	it("trims a path down to a vault-relative one", () => {
		expect(normalizeVaultPath("  /Resources//Reactions.base/ ")).toBe(
			"Resources/Reactions.base",
		);
	});
});

describe("readSettings", () => {
	it("starts a fresh installation without a reaction base", () => {
		expect(readSettings(null).reactionBase).toEqual(DEFAULT_SETTINGS.reactionBase);
	});

	it("reads the reaction base back as it was stored", () => {
		const stored = {
			reactionBase: {
				file: "Reactions.base",
				tag: "Reaction",
				allView: "Everything",
			},
		};

		expect(readSettings(stored).reactionBase).toEqual(stored.reactionBase);
	});

	it("leaves the first view unnamed when nothing was stored for it", () => {
		expect(
			readSettings({ reactionBase: { file: "Reactions.base", tag: "Reaction" } }).reactionBase,
		).toEqual({ file: "Reactions.base", tag: "Reaction", allView: "" });
	});

	it("falls back on anything stored in the wrong shape", () => {
		expect(
			readSettings({ reactionBase: { file: 7, tag: null, allView: [] } }).reactionBase,
		).toEqual({ file: "", tag: "", allView: "" });
	});
});
