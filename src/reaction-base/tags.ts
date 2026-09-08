/*
 * Sorting the notes of the vault into the groups a reaction base shows.
 *
 * A note of a collection says what it is good for by a tag below one top-level
 * tag — `Reaction/Approve` under `Reaction` — and one group gathers the notes of
 * one such tag. A note carrying several of them belongs to several groups: the
 * groups are a way of browsing the collection, not a filing system, and a
 * picture one answers a joke with and applauds with as well is worth finding
 * under both.
 *
 * One group is not a tag of its own: the first one, which gathers every
 * reaction there is so that the base opens on the whole wall of them. It has no
 * name of its own to be called by, so it is named in the settings, and a name
 * nobody has typed is a group nobody asked for — it is left out of the base
 * altogether.
 *
 * Nothing here knows about Obsidian, or about the file the groups end up in.
 * It is handed the tags of the notes, one list per note, and answers which
 * groups they make up and in which order they are worth showing.
 */

/** One group of reactions, as one view of the base shows it. */
export interface ReactionGroup {
	/** The name the view carries. */
	name: string;
	/**
	 * The tag whose notes it gathers, the tags below that one counting as well.
	 * The group of every reaction gathers the top-level tag itself.
	 */
	tag: string;
	/** How many notes of the vault it gathers. */
	notes: number;
}

/** What the groups of one base are made of. */
export interface ReactionGrouping {
	/** The tag the reactions sit under. */
	tag: string;
	/**
	 * The name of the group of every reaction there is, or a blank string when
	 * it is not to be made at all.
	 */
	all: string;
}

/** The groups the notes of the vault make up, and how many notes took part. */
export interface ReactionGroups {
	/** One group per view, in the order the views are written in. */
	groups: ReactionGroup[];
	/** How many notes carry the top-level tag at all. */
	notes: number;
}

/**
 * Trims a tag as the user typed it: outer whitespace, the leading `#`, repeated
 * separators and leading and trailing slashes are dropped. A tag that names
 * nothing comes back as an empty string.
 */
export function normalizeTag(tag: string): string {
	return tag
		.trim()
		.replace(/^#+/, "")
		.replace(/\/+/g, "/")
		.replace(/^\/|\/$/g, "")
		.trim();
}

/**
 * One part of a tag, spelled out the way it is read: a word that runs into the
 * next one is broken in two and the second word is lowered, so that a
 * `SoPleased` is shown as `So pleased`. An abbreviation is left as it stands —
 * an `NSFW` is not a word that ran into another — and so is a part that runs a
 * digit into a letter, such as a `3D`.
 */
function spellOut(part: string): string {
	return part
		.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
		.split(" ")
		.map((word, index) =>
			index === 0 || word === word.toUpperCase()
				? word
				: `${word.charAt(0).toLowerCase()}${word.slice(1)}`,
		)
		.join(" ");
}

/**
 * The name a view of one tag carries: the tag with the top-level one taken off
 * the front, every part of what is left spelled out. A deeper
 * `Reaction/Approve/Loudly` keeps the slash it is written with.
 */
export function nameOfTag(tag: string, topTag: string): string {
	return tag
		.slice(topTag.length + 1)
		.split("/")
		.map(spellOut)
		.join("/");
}

/**
 * Whether the tag is the top-level one or sits below it. Tags of Obsidian are
 * matched without regard to case, and so are these.
 */
function isUnder(tag: string, topTag: string): boolean {
	const lower = tag.toLowerCase();
	const top = topTag.toLowerCase();

	return lower === top || lower.startsWith(`${top}/`);
}

/**
 * The tags of one note that sit below the top-level one, each of them once.
 * The same tag written in two ways — `Reaction/Approve` and `reaction/approve`
 * — is the same tag to Obsidian, so the first spelling stands for both.
 */
function tagsUnder(tags: readonly string[], topTag: string): string[] {
	const found = new Map<string, string>();

	for (const tag of tags) {
		const normalized = normalizeTag(tag);

		if (normalized !== "" && isUnder(normalized, topTag)) {
			const key = normalized.toLowerCase();

			if (!found.has(key)) {
				found.set(key, normalized);
			}
		}
	}

	return [...found.values()];
}

/**
 * Sorts the notes into groups: every reaction there is, which is only made when
 * it is named in the settings, and one group per tag below the top-level one.
 *
 * Every reaction comes first, that being the view the base opens on. The tags
 * follow by name, from A to Z: a row of views one reads through is a row one
 * can find a name in.
 */
export function groupReactionTags(
	grouping: ReactionGrouping,
	notes: readonly (readonly string[])[],
): ReactionGroups {
	const top = normalizeTag(grouping.tag);
	const all = grouping.all.trim();

	if (top === "") {
		return { groups: [], notes: 0 };
	}

	// Keyed by the tag in lower case, so that two spellings of one tag are
	// counted as one; the spelling that is kept is the one seen first.
	const counted = new Map<string, { tag: string; notes: number }>();
	let total = 0;

	for (const tags of notes) {
		const under = tagsUnder(tags, top);

		if (under.length === 0) {
			continue;
		}

		total += 1;

		// A note carrying the top-level tag and nothing below it is a reaction
		// nobody has said which one it is: it is counted among all of them, and
		// there is no view it belongs to of its own.
		for (const tag of under.filter((one) => one.length > top.length)) {
			const key = tag.toLowerCase();
			const group = counted.get(key);

			if (group === undefined) {
				counted.set(key, { tag, notes: 1 });
			} else {
				group.notes += 1;
			}
		}
	}

	if (total === 0) {
		return { groups: [], notes: 0 };
	}

	const named: ReactionGroup[] = [...counted.values()].map((group) => ({
		name: nameOfTag(group.tag, top),
		tag: group.tag,
		notes: group.notes,
	}));

	// The row of views is read the way the tags are written, so the names are
	// put in Russian order whatever the language Obsidian happens to run in:
	// left to the machine, the same row would come out ordered one way here and
	// another way on the next computer.
	named.sort((left, right) => left.name.localeCompare(right.name, "ru"));

	const first: ReactionGroup[] =
		all === "" ? [] : [{ name: all, tag: top, notes: total }];

	return { groups: [...first, ...named], notes: total };
}
