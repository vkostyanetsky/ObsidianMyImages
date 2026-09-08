/*
 * Sorting the notes of the vault into the groups a base of the memes shows.
 *
 * A meme carries a tag below one top-level tag — `Memes/Funny` under `Memes` —
 * and one group gathers the notes of one such tag. A note carrying several of
 * them belongs to several groups: the groups are a way of browsing the memes,
 * not a filing system, and a meme about work one is also angry about is worth
 * finding under both.
 *
 * Two groups are not tags of their own, and both come before the rest. The
 * first gathers every meme there is, asking for the top-level tag itself, so
 * that the base opens on the whole wall of them. The second gathers the memes
 * that carry that tag and nothing below it: nothing has been said about what
 * they are good for, and what they do carry is the tags of other trees — a
 * Topics/War, a Media/Batman — which is what that view sorts them by.
 *
 * Neither has a name of its own to be called by, so both are named in the
 * settings, and a name nobody has typed is a group nobody asked for: it is left
 * out of the base altogether.
 *
 * Nothing here knows about Obsidian, or about the file the groups end up in.
 * It is handed the tags of the notes, one list per note, and answers which
 * groups they make up and in which order they are worth showing.
 */

/** One group of memes, as one view of the base shows it. */
export interface MemeGroup {
	/** The name the view carries. */
	name: string;
	/**
	 * The tag whose notes it gathers, the tags below that one counting as well.
	 * The group of every meme and the group of the memes nothing was said about
	 * both gather the top-level tag.
	 */
	tag: string;
	/**
	 * The tags whose notes it leaves out. Only the memes nothing was said about
	 * leave any out, those being every tag below the top-level one.
	 */
	without: string[];
	/**
	 * Whether the view sorts its memes by their tags before it sorts them the
	 * way the rest of the views do. Only the memes nothing was said about do:
	 * their tags are all they are told apart by.
	 */
	byTags: boolean;
	/** How many notes of the vault it gathers. */
	notes: number;
}

/** What the groups of one base are made of. */
export interface MemeGrouping {
	/** The tag the memes sit under. */
	tag: string;
	/**
	 * The name of the group of every meme there is, or a blank string when it is
	 * not to be made at all.
	 */
	all: string;
	/**
	 * The name of the group of memes that carry no tag below the top-level one,
	 * or a blank string when it is not to be made at all.
	 */
	byTopic: string;
}

/** The groups the notes of the vault make up, and how many notes took part. */
export interface MemeGroups {
	/** One group per view, in the order the views are written in. */
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
 * the front, every part of what is left spelled out. A deeper `Memes/Funny/Cats`
 * keeps the slash it is written with.
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
 * Sorts the notes into groups: every meme there is, one group per tag below the
 * top-level one, and one for the memes that carry the top-level tag alone. The
 * two that are named in the settings are only made when they are named.
 *
 * Every meme comes first, that being the view the base opens on, and the memes
 * nothing was said about come right after it. The tags follow by name, from A
 * to Z: a row of views one reads through is a row one can find a name in.
 */
export function groupMemeTags(
	grouping: MemeGrouping,
	notes: readonly (readonly string[])[],
): MemeGroups {
	const top = normalizeTag(grouping.tag);
	const all = grouping.all.trim();
	const byTopic = grouping.byTopic.trim();

	if (top === "") {
		return { groups: [], notes: 0 };
	}

	// Keyed by the tag in lower case, so that two spellings of one tag are
	// counted as one; the spelling that is kept is the one seen first.
	const counted = new Map<string, { tag: string; notes: number }>();
	let unsaid = 0;
	let total = 0;

	for (const tags of notes) {
		const under = tagsUnder(tags, top);

		if (under.length === 0) {
			continue;
		}

		total += 1;

		// A note carrying both `Memes` and `Memes/Funny` has been said
		// something about, so it is not one of the memes nothing was said of.
		const below = under.filter((tag) => tag.length > top.length);

		if (below.length === 0) {
			unsaid += 1;
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

	if (total === 0) {
		return { groups: [], notes: 0 };
	}

	const subtags = [...counted.values()];
	const named: MemeGroup[] = subtags.map((group) => ({
		name: nameOfTag(group.tag, top),
		tag: group.tag,
		without: [],
		byTags: false,
		notes: group.notes,
	}));

	// The row of views is read the way the tags are written, so the names are
	// put in Russian order whatever the language Obsidian happens to run in:
	// left to the machine, the same row would come out ordered one way here and
	// another way on the next computer.
	named.sort((left, right) => left.name.localeCompare(right.name, "ru"));

	const first: MemeGroup[] = [];

	if (all !== "") {
		first.push({ name: all, tag: top, without: [], byTags: false, notes: total });
	}

	if (byTopic !== "" && unsaid > 0) {
		// The memes nothing was said about are every meme less the ones that
		// carry a tag below the top-level one, so the tags they leave out are
		// all the tags there are.
		first.push({
			name: byTopic,
			tag: top,
			without: subtags.map((group) => group.tag),
			byTags: true,
			notes: unsaid,
		});
	}

	return { groups: [...first, ...named], notes: total };
}
