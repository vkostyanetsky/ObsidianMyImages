import { describe, expect, it } from "vitest";

import { groupMemeTags, nameOfTag, normalizeTag } from "../src/meme-base/tags";
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
				name: "Everything",
				order: ["file.name"],
				sort: [{ property: "timestamp", direction: "DESC" }],
				image: "formula.preview",
				cardSize: 350,
			},
		],
	};
}

/** The views of a rebuilt base, or a failure of the test that asked for them. */
function viewsOf(base: unknown, groups: Parameters<typeof rebuildMemeBaseViews>[1]) {
	const rebuilt = rebuildMemeBaseViews(base, groups);

	if (rebuilt.kind !== "rebuilt") {
		throw new Error("the base was not rebuilt");
	}

	return { views: rebuilt.base.views as Record<string, unknown>[], rebuilt };
}

/** The two names that are not taken from a tag, as the settings carry them. */
const EVERYTHING = "Everything";
const BY_TOPIC = "By topic";

/** What one base groups its notes by, both views named unless said otherwise. */
function grouping(tag: string, all = EVERYTHING, byTopic = BY_TOPIC) {
	return { tag, all, byTopic };
}

/** One group of one tag, as the grouping hands it over. */
function groupOf(name: string, tag: string, notes: number) {
	return { name, tag, without: [], byTags: false, notes };
}

/** The group of every meme there is, which asks for the top-level tag. */
function groupOfEverything(tag: string, notes: number) {
	return groupOf(EVERYTHING, tag, notes);
}

/** The group of the memes nothing was said about, which sorts by its tags. */
function groupByTopic(tag: string, without: string[], notes: number) {
	return { name: BY_TOPIC, tag, without, byTags: true, notes };
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

describe("nameOfTag", () => {
	it("takes the top-level tag off the front", () => {
		expect(nameOfTag("Memes/Funny", "Memes")).toBe("Funny");
	});

	it("spells out a word that runs into the next one", () => {
		expect(nameOfTag("Мемы/ДоволенСобой", "Мемы")).toBe("Доволен собой");
		expect(nameOfTag("Мемы/НужнаПомощь", "Мемы")).toBe("Нужна помощь");
		expect(nameOfTag("Memes/SoPleased", "Memes")).toBe("So pleased");
	});

	it("spells out a name of three words as well", () => {
		expect(nameOfTag("Memes/OneTwoThree", "Memes")).toBe("One two three");
	});

	it("leaves an abbreviation as it stands", () => {
		expect(nameOfTag("Мемы/NSFW", "Мемы")).toBe("NSFW");
		expect(nameOfTag("Мемы/3D", "Мемы")).toBe("3D");
	});

	it("leaves a word that runs into an abbreviation unlowered", () => {
		expect(nameOfTag("Memes/GoodNSFW", "Memes")).toBe("Good NSFW");
	});

	it("spells out every part of a deeper tag, slash and all", () => {
		expect(nameOfTag("Memes/FunnyOnes/BigCats", "Memes")).toBe("Funny ones/Big cats");
	});
});

describe("groupMemeTags", () => {
	it("makes one group per tag below the top-level one", () => {
		const { groups, notes } = groupMemeTags(grouping("Memes"), [
			["Memes/Funny"],
			["Memes/Funny"],
			["Memes/Work"],
		]);

		expect(notes).toBe(3);
		expect(groups).toEqual([
			groupOfEverything("Memes", 3),
			groupOf("Funny", "Memes/Funny", 2),
			groupOf("Work", "Memes/Work", 1),
		]);
	});

	it("gathers every meme there is in the first group", () => {
		const { groups } = groupMemeTags(grouping("Memes"), [
			["Memes/Funny"],
			["Memes/Work", "Memes/Anger"],
			["Memes"],
		]);

		expect(groups[0]).toEqual(groupOfEverything("Memes", 3));
	});

	it("counts a note of two tags in both of their groups", () => {
		const { groups, notes } = groupMemeTags(grouping("Memes"), [["Memes/Funny", "Memes/Work"]]);

		expect(notes).toBe(1);
		expect(groups.slice(1).map((group) => group.notes)).toEqual([1, 1]);
	});

	it("leaves the tags of other trees out of the groups", () => {
		const { groups } = groupMemeTags(grouping("Memes"), [["Memes/Funny", "Media/Batman", "Topics/AI"]]);

		expect(groups).toEqual([groupOfEverything("Memes", 1), groupOf("Funny", "Memes/Funny", 1)]);
	});

	it("passes over the notes that carry no tag of the tree", () => {
		const { groups, notes } = groupMemeTags(grouping("Memes"), [["Media/Batman"], [], ["Memesque"]]);

		expect(notes).toBe(0);
		expect(groups).toEqual([]);
	});

	it("gathers the notes that carry the top-level tag alone in one group of their own", () => {
		const { groups, notes } = groupMemeTags(grouping("Memes"), [
			["Memes", "Topics/AI"],
			["Memes"],
			["Memes/Funny"],
		]);

		expect(notes).toBe(3);
		expect(groups).toEqual([
			groupOfEverything("Memes", 3),
			groupByTopic("Memes", ["Memes/Funny"], 2),
			groupOf("Funny", "Memes/Funny", 1),
		]);
	});

	it("leaves out every tag there is when gathering the memes nothing was said about", () => {
		const { groups } = groupMemeTags(grouping("Memes"), [["Memes"], ["Memes/Funny"], ["Memes/Work"]]);
		const byTopic = groups.find((group) => group.name === BY_TOPIC);

		expect(byTopic?.without).toEqual(["Memes/Funny", "Memes/Work"]);
	});

	it("has no group for the memes nothing was said about when there are none", () => {
		const { groups } = groupMemeTags(grouping("Memes"), [["Memes/Funny"]]);

		expect(groups.map((group) => group.name)).toEqual([EVERYTHING, "Funny"]);
	});

	it("counts a note carrying the top-level tag and one below it as said about", () => {
		const { groups, notes } = groupMemeTags(grouping("Memes"), [["Memes", "Memes/Funny"]]);

		expect(notes).toBe(1);
		expect(groups).toEqual([groupOfEverything("Memes", 1), groupOf("Funny", "Memes/Funny", 1)]);
	});

	it("counts one tag written in two ways as one group, whatever the case of the top-level one", () => {
		const { groups } = groupMemeTags(grouping("MEMES"), [["Memes/Funny"], ["memes/funny"]]);

		expect(groups).toEqual([groupOfEverything("MEMES", 2), groupOf("Funny", "Memes/Funny", 2)]);
	});

	it("counts a tag repeated in one note once", () => {
		const { groups } = groupMemeTags(grouping("Memes"), [["Memes/Funny", "#Memes/Funny"]]);

		expect(groups).toEqual([groupOfEverything("Memes", 1), groupOf("Funny", "Memes/Funny", 1)]);
	});

	it("takes the deeper tags as they are", () => {
		const { groups } = groupMemeTags(grouping("Memes"), [["Memes/Funny/Cats"]]);

		expect(groups[1]).toEqual(groupOf("Funny/Cats", "Memes/Funny/Cats", 1));
	});

	it("names a group of a run-together tag as it is read, the tag itself untouched", () => {
		const { groups } = groupMemeTags(grouping("Мемы"), [["Мемы/ДоволенСобой"]]);

		expect(groups[1]).toEqual(groupOf("Доволен собой", "Мемы/ДоволенСобой", 1));
	});

	it("shows the groups after the first one by name, whatever their size", () => {
		const { groups } = groupMemeTags(grouping("Memes"), [
			["Memes/Work"],
			["Memes/Work"],
			["Memes/Anger"],
			["Memes/Calm"],
		]);

		expect(groups.map((group) => group.name)).toEqual([EVERYTHING, "Anger", "Calm", "Work"]);
	});

	it("puts the memes nothing was said about right after every meme, ahead of the tags", () => {
		const { groups } = groupMemeTags(grouping("Мемы"), [
			["Мемы/Работа"],
			["Мемы/Агрессия"],
			["Мемы/Смешное"],
			["Мемы"],
		]);

		expect(groups.map((group) => group.name)).toEqual([
			EVERYTHING,
			BY_TOPIC,
			"Агрессия",
			"Работа",
			"Смешное",
		]);
	});

	it("has nothing to group without a tag to group under", () => {
		expect(groupMemeTags(grouping("  "), [["Memes/Funny"]])).toEqual({ groups: [], notes: 0 });
	});

	it("makes no group of every meme when that view is left unnamed", () => {
		const { groups, notes } = groupMemeTags(grouping("Memes", "", BY_TOPIC), [
			["Memes"],
			["Memes/Funny"],
		]);

		expect(notes).toBe(2);
		expect(groups.map((group) => group.name)).toEqual([BY_TOPIC, "Funny"]);
	});

	it("makes no group of the memes without a tag when that view is left unnamed", () => {
		const { groups } = groupMemeTags(grouping("Memes", EVERYTHING, "   "), [
			["Memes"],
			["Memes/Funny"],
		]);

		expect(groups.map((group) => group.name)).toEqual([EVERYTHING, "Funny"]);
	});

	it("makes the tags alone when neither of the two is named", () => {
		const { groups } = groupMemeTags(grouping("Memes", "", ""), [["Memes"], ["Memes/Funny"]]);

		expect(groups.map((group) => group.name)).toEqual(["Funny"]);
	});

	it("has nothing to group at all when the tags are unused and neither is named", () => {
		expect(groupMemeTags(grouping("Memes", "", ""), [["Memes"]]).groups).toEqual([]);
	});

	it("takes the two names as they are typed, whitespace aside", () => {
		const { groups } = groupMemeTags(grouping("Memes", "  Все  ", " По темам "), [["Memes"]]);

		expect(groups.map((group) => group.name)).toEqual(["Все", "По темам"]);
	});
});

describe("filtersOfGroup", () => {
	it("filters a group by the tag of the group", () => {
		expect(filtersOfGroup(groupOf("Funny", "Memes/Funny", 1))).toEqual({
			and: ['file.hasTag("Memes/Funny")'],
		});
	});

	it("filters every meme there is by the top-level tag, its own tags counting too", () => {
		expect(filtersOfGroup(groupOfEverything("Memes", 1))).toEqual({
			and: ['file.hasTag("Memes")'],
		});
	});

	it("turns down every tag there is when filtering the memes nothing was said about", () => {
		expect(filtersOfGroup(groupByTopic("Memes", ["Memes/Funny", "Memes/Work"], 1))).toEqual({
			and: [
				'file.hasTag("Memes")',
				{ not: ['file.hasTag("Memes/Funny", "Memes/Work")'] },
			],
		});
	});
});

describe("rebuildMemeBaseViews", () => {
	const groups = [
		groupOfEverything("Memes", 3),
		groupByTopic("Memes", ["Memes/Funny"], 1),
		groupOf("Funny", "Memes/Funny", 2),
	];

	it("leaves the header of the file as it is", () => {
		const base = baseOfOneView();
		const { rebuilt } = viewsOf(base, groups);

		expect(rebuilt.base.filters).toEqual(base.filters);
		expect(rebuilt.base.formulas).toEqual(base.formulas);
	});

	it("writes one view per group, the first of them the one of every meme", () => {
		const { views, rebuilt } = viewsOf(baseOfOneView(), groups);

		expect(rebuilt.views).toBe(3);
		expect(views.map((view) => view.name)).toEqual([EVERYTHING, BY_TOPIC, "Funny"]);
		expect(views[0].filters).toEqual({ and: ['file.hasTag("Memes")'] });
		expect(views[2].filters).toEqual({ and: ['file.hasTag("Memes/Funny")'] });
	});

	it("cuts every view from the one the file opened with, name and filter aside", () => {
		const { views } = viewsOf(baseOfOneView(), groups);
		const model = (baseOfOneView().views as Record<string, unknown>[])[0];

		for (const view of views) {
			expect(view.type).toBe(model.type);
			expect(view.image).toBe(model.image);
			expect(view.cardSize).toBe(model.cardSize);
			expect(view.order).toEqual(model.order);
		}

		expect(views[0].sort).toEqual(model.sort);
		expect(views[2].sort).toEqual(model.sort);
	});

	it("sorts the memes nothing was said about by their tags, the model's order after", () => {
		const { views } = viewsOf(baseOfOneView(), groups);
		const model = (baseOfOneView().views as Record<string, unknown>[])[0];

		expect(views[1].sort).toEqual([
			{ property: "tags", direction: "ASC" },
			...(model.sort as unknown[]),
		]);
	});

	it("sorts them by their tags even when the model sorts by nothing", () => {
		const base = baseOfOneView();
		const model = base.views as Record<string, unknown>[];

		delete model[0].sort;

		const { views } = viewsOf(base, groups);

		expect(views[1].sort).toEqual([{ property: "tags", direction: "ASC" }]);
		expect(views[0].sort).toBeUndefined();
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
		const model = (baseOfOneView().views as Record<string, unknown>[])[0];

		expect(twice.views.map((view) => view.name)).toEqual([EVERYTHING, "Funny"]);
		expect(twice.views[1].sort).toEqual(model.sort);
	});

	it("keeps the filter of the model out of the generated views", () => {
		const base = baseOfOneView();
		const model = base.views as Record<string, unknown>[];

		model[0].filters = { and: ['file.inFolder("Memes")'] };

		const { views } = viewsOf(base, [groups[2]]);

		expect(views[1]).toBeUndefined();
		expect(views[0].filters).toEqual({ and: ['file.hasTag("Memes/Funny")'] });
	});

	it("leaves a file it could take no view from alone", () => {
		expect(rebuildMemeBaseViews({ views: [] }, groups)).toEqual({ kind: "no-views" });
		expect(rebuildMemeBaseViews({}, groups)).toEqual({ kind: "no-views" });
		expect(rebuildMemeBaseViews(null, groups)).toEqual({ kind: "no-views" });
		expect(rebuildMemeBaseViews("views", groups)).toEqual({ kind: "no-views" });
	});

	it("leaves a file alone when there is no group to write", () => {
		expect(rebuildMemeBaseViews(baseOfOneView(), [])).toEqual({ kind: "no-views" });
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

	it("says when there would be no view to write", () => {
		expect(lineOf({ kind: "no-groups", path: "Memes.base", tag: "Memes" })).toContain(
			"no view to write",
		);
	});

	it("says when no note carries the tag", () => {
		expect(lineOf({ kind: "no-notes", path: "Memes.base", tag: "Memes" })).toBe(
			'No note of the vault carries the tag "Memes".',
		);
	});

	it("counts the views and the notes of a run", () => {
		expect(lineOf({ kind: "written", path: "Memes.base", views: 39, notes: 2579 })).toBe(
			'Rebuilt "Memes.base": 39 views over 2579 notes.',
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
		const stored = {
			memeBase: {
				file: "Memes.base",
				tag: "Memes",
				allView: "Everything",
				topicView: "By topic",
			},
		};

		expect(readSettings(stored).memeBase).toEqual(stored.memeBase);
	});

	it("leaves the two views unnamed when nothing was stored for them", () => {
		expect(readSettings({ memeBase: { file: "Memes.base", tag: "Memes" } }).memeBase).toEqual({
			file: "Memes.base",
			tag: "Memes",
			allView: "",
			topicView: "",
		});
	});

	it("falls back on anything stored in the wrong shape", () => {
		expect(
			readSettings({ memeBase: { file: 7, tag: null, allView: [], topicView: 0 } }).memeBase,
		).toEqual({ file: "", tag: "", allView: "", topicView: "" });
	});
});
