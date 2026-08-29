import { describe, expect, it } from "vitest";

import { findFirstTweetId, noteTweetDate, tweetDate, tweetTimestamp } from "../src/tweets/tweets";

describe("findFirstTweetId", () => {
	it("finds the id in an address of either domain", () => {
		expect(findFirstTweetId("https://x.com/user/status/1234567890123456789")).toBe(
			"1234567890123456789",
		);
		expect(findFirstTweetId("https://twitter.com/user/status/850006245121695744")).toBe(
			"850006245121695744",
		);
	});

	it("reads an address however it is written down", () => {
		const sources = [
			"See [the tweet](https://x.com/user/status/850006245121695744) for the picture.",
			"http://mobile.twitter.com/user/statuses/850006245121695744",
			"<https://www.x.com/user/status/850006245121695744?s=20&t=abc>",
			"https://x.com/i/web/status/850006245121695744/photo/1",
		];

		for (const source of sources) {
			expect(findFirstTweetId(source)).toBe("850006245121695744");
		}
	});

	it("reads the address a note keeps in its frontmatter", () => {
		const source = [
			"---",
			"source: https://x.com/user/status/850006245121695744",
			"---",
			"",
			"![[Cat.png]]",
		].join("\n");

		expect(findFirstTweetId(source)).toBe("850006245121695744");
	});

	it("takes the first of several addresses", () => {
		const source = [
			"https://x.com/user/status/850006245121695744",
			"https://x.com/other/status/1234567890123456789",
		].join("\n");

		expect(findFirstTweetId(source)).toBe("850006245121695744");
	});

	it("leaves an address inside a fenced code block alone", () => {
		const source = [
			"```",
			"https://x.com/user/status/850006245121695744",
			"```",
			"",
			"https://x.com/other/status/1234567890123456789",
		].join("\n");

		expect(findFirstTweetId(source)).toBe("1234567890123456789");
	});

	it("finds nothing where no tweet is linked to", () => {
		expect(findFirstTweetId("Nothing to see here.")).toBeNull();
		// A profile is not a tweet, and neither is a host that only ends alike.
		expect(findFirstTweetId("https://x.com/user")).toBeNull();
		expect(findFirstTweetId("https://notx.com/user/status/850006245121695744")).toBeNull();
		// An address without its scheme is a word, not a link.
		expect(findFirstTweetId("x.com/user/status/850006245121695744")).toBeNull();
	});
});

describe("tweetTimestamp", () => {
	it("reads the millisecond out of an id", () => {
		expect(tweetTimestamp("1234567890123456789")).toBe(1583178896824);
		expect(tweetTimestamp("850006245121695744")).toBe(1491492255846);
	});

	it("reads nothing out of an id that carries no timestamp", () => {
		// The tweets numbered one by one, before the ids were counted this way.
		expect(tweetTimestamp("20")).toBeNull();
		expect(tweetTimestamp("")).toBeNull();
		expect(tweetTimestamp("12abc")).toBeNull();
	});
});

describe("tweetDate", () => {
	it("gives the day the tweet was posted on, in UTC", () => {
		expect(tweetDate("1234567890123456789")).toBe("2020-03-02");
		expect(tweetDate("850006245121695744")).toBe("2017-04-06");
		expect(tweetDate("1959580042424864975")).toBe("2025-08-24");
	});

	it("gives nothing for an id that carries no timestamp", () => {
		expect(tweetDate("20")).toBeNull();
	});
});

describe("noteTweetDate", () => {
	it("dates a note after the first tweet it links to", () => {
		const source = [
			"---",
			"tags:",
			"  - cats",
			"---",
			"",
			"![[Cat 1.png]]",
			"",
			"From [this one](https://x.com/user/status/850006245121695744).",
		].join("\n");

		expect(noteTweetDate(source)).toBe("2017-04-06");
	});

	it("dates nothing when the note links to no tweet", () => {
		expect(noteTweetDate("![[Cat 1.png]]")).toBeNull();
	});
});
