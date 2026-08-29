/*
 * The day a tweet was posted on, worked out from its own address.
 *
 * A tweet carries its timestamp in its id: everything above the lowest 22 bits
 * of the number is the millisecond it was handed out at, counted from an epoch
 * of Twitter's own. Nothing is fetched from the network, so the date of a link
 * is known even for a tweet that has since been deleted.
 */

import { findContentLines, findFrontmatterRange, splitLines } from "../markdown/lines";

/**
 * A link to a single tweet, on either of the two domains it has been served
 * under, subdomains such as `mobile.` included. The address has to carry its
 * scheme, so that a word ending in `x.com` is never taken for a link.
 */
const TWEET_LINK = /https?:\/\/(?:[\w-]+\.)*(?:twitter|x)\.com\/[^\s)<>"']*?\/status(?:es)?\/(\d{1,19})/gi;

/** The millisecond the ids are counted from: 2010-11-04T01:42:54.657Z. */
const TWITTER_EPOCH = 1288834974657;

/** The lowest 22 bits of an id belong to the machine that handed it out. */
const TIMESTAMP_DIVISOR = 4194304;

/**
 * The first id that carries a timestamp at all. Everything below it was handed
 * out by counting up, back before Twitter numbered its tweets this way, and
 * says nothing about when it was posted.
 */
const FIRST_SNOWFLAKE_ID = 29700859247;

/** Nothing but digits, and no more of them than an id ever has. */
const TWEET_ID = /^\d{1,19}$/;

/**
 * The lines a link may be found in: the frontmatter, where a note often keeps
 * the address it was made from, and the text, fenced code blocks left out.
 */
function linkLines(source: string): string[] {
	const lines = splitLines(source);
	const range = findFrontmatterRange(lines);
	const frontmatter = range === null ? [] : lines.slice(range.start, range.end);

	return [...frontmatter, ...findContentLines(source)].map((line) => line.text);
}

/**
 * The id of the first tweet the note links to, or `null` when it links to
 * none. A note that carries several links is dated after the first of them,
 * which is the one it was written about.
 */
export function findFirstTweetId(source: string): string | null {
	for (const line of linkLines(source)) {
		// A pattern with the global flag keeps its own position between calls.
		TWEET_LINK.lastIndex = 0;

		const match = TWEET_LINK.exec(line);

		if (match !== null) {
			return match[1];
		}
	}

	return null;
}

/**
 * The millisecond the tweet was posted at, or `null` when the id carries no
 * timestamp.
 *
 * An id is longer than a number can hold exactly, but the millisecond is not:
 * the rounding happens in the bits that are divided away, and what is left is
 * off by less than one millisecond.
 */
export function tweetTimestamp(id: string): number | null {
	if (!TWEET_ID.test(id)) {
		return null;
	}

	const value = Number(id);

	if (value < FIRST_SNOWFLAKE_ID) {
		return null;
	}

	return TWITTER_EPOCH + Math.floor(value / TIMESTAMP_DIVISOR);
}

/** A moment as a day, in UTC, the way a note writes one down. */
function formatDate(date: Date): string {
	const year = String(date.getUTCFullYear()).padStart(4, "0");
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");

	return `${year}-${month}-${day}`;
}

/**
 * The day the tweet was posted on as `YYYY-MM-DD`, or `null` when the id says
 * nothing about it. The day is the one it was in UTC, so that the same link
 * always comes out as the same date, wherever the vault is opened.
 */
export function tweetDate(id: string): string | null {
	const timestamp = tweetTimestamp(id);

	return timestamp === null ? null : formatDate(new Date(timestamp));
}

/** The day the first tweet the note links to was posted on, if there is one. */
export function noteTweetDate(source: string): string | null {
	const id = findFirstTweetId(source);

	return id === null ? null : tweetDate(id);
}
