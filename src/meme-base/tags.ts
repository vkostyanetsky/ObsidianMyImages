/*
 * Sorting the notes of the vault into the groups a base of the memes shows.
 *
 * A meme carries a tag below one top-level tag — `Memes/Funny` under `Memes` —
 * and one group gathers the notes of one such tag. A note carrying several of
 * them belongs to several groups: the groups are a way of browsing the memes,
 * not a filing system, and a meme about work one is also angry about is worth
 * finding under both.
 *
 * Nothing here knows about Obsidian, or about the file the groups end up in.
 * It is handed the tags of the notes, one list per note, and answers which
 * groups they make up and in which order they are worth showing.
 */

/** One group of memes, as one view of the base shows it. */
export interface MemeGroup {
	/** The name the view carries, which is the tag without the top-level one. */
	name: string;
	/**
	 * The tag whose notes it gathers, or `null` for the notes that carry the
	 * top-level tag and nothing below it.
	 */
	tag: string | null;
	/** How many notes of the vault it gathers. */
	notes: number;
}

/** The groups the notes of the vault make up, and how many notes took part. */
export interface MemeGroups {
	/** One group per tag, in the order the views are worth showing in. */
	groups: MemeGroup[];
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

/** The last part of a tag: `Memes/Funny` is shown as `Funny` would be. */
function lastPart(tag: string): string {
	const parts = tag.split("/");

	return parts[parts.length - 1];
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
 * The same tag written in two ways — `Memes/Funny` and `memes/funny` — is the
 * same tag to Obsidian, so the first spelling stands for both.
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
 * Sorts the notes into groups: one per tag below the top-level one, plus one
 * for the notes that carry the top-level tag alone.
 *
 * The groups come back in the order they are worth browsing in — the largest
 * first, ties settled by name — with the leftovers last, whatever their size:
 * they are the memes nobody has said anything about yet, and they belong at
 * the end of the row of views rather than in the middle of it.
 */
export function groupMemeTags(
	topTag: string,
	notes: readonly (readonly string[])[],
): MemeGroups {
	const top = normalizeTag(topTag);

	if (top === "") {
		return { groups: [], notes: 0 };
	}

	// Keyed by the tag in lower case, so that two spellings of one tag are
	// counted as one; the spelling that is kept is the one seen first.
	const counted = new Map<string, { tag: string; notes: number }>();
	let bare = 0;
	let total = 0;

	for (const tags of notes) {
		const under = tagsUnder(tags, top);

		if (under.length === 0) {
			continue;
		}

		total += 1;

		// A note carrying both `Memes` and `Memes/Funny` has been said
		// something about, so it is not one of the leftovers.
		const below = under.filter((tag) => tag.length > top.length);

		if (below.length === 0) {
			bare += 1;
			continue;
		}

		for (const tag of below) {
			const key = tag.toLowerCase();
			const group = counted.get(key);

			if (group === undefined) {
				counted.set(key, { tag, notes: 1 });
			} else {
				group.notes += 1;
			}
		}
	}

	const groups: MemeGroup[] = [...counted.values()]
		.map((group) => ({
			name: group.tag.slice(top.length + 1),
			tag: group.tag,
			notes: group.notes,
		}))
		.sort((left, right) => right.notes - left.notes || left.name.localeCompare(right.name));

	if (bare > 0) {
		// The leftovers are named after the top-level tag itself: a view called
		// `Memes` among views called `Funny` and `Work` reads as the memes that
		// are nothing more than memes so far.
		groups.push({ name: lastPart(top), tag: null, notes: bare });
	}

	return { groups, notes: total };
}
