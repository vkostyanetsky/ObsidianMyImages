import { findContentLines } from "../markdown/lines";
import { fileExtension } from "./paths";
import type { ImageEmbed, PathEncoding } from "./types";

/** File extensions Obsidian renders as an image. */
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];

/** A scheme-qualified or protocol-relative address, i.e. not a vault file. */
const EXTERNAL_PATTERN = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

/** Characters `encodeURIComponent` leaves alone but a Markdown link cannot carry. */
const UNSAFE_IN_MARKDOWN = /[()]/g;

/** Whether the extension of the path is one of the recognised image formats. */
export function isImagePath(path: string): boolean {
	const extension = fileExtension(path).toLowerCase();

	return IMAGE_EXTENSIONS.indexOf(extension) !== -1;
}

/** Whether the path points outside the vault and must be left alone. */
export function isExternalPath(path: string): boolean {
	return EXTERNAL_PATTERN.test(path);
}

function decodePathSegment(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		// A stray `%` is not an escape sequence — keep the segment as written.
		return segment;
	}
}

/** Decodes a percent-encoded link path, keeping its folder separators. */
export function decodeLinkPath(path: string): string {
	return path.split("/").map(decodePathSegment).join("/");
}

/** Encodes a single path segment for the given kind of link. */
export function encodePathSegment(segment: string, encoding: PathEncoding): string {
	if (encoding === "plain") {
		return segment;
	}

	return encodeURIComponent(segment).replace(
		UNSAFE_IN_MARKDOWN,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

/**
 * Blanks out inline code spans, keeping every other character at its offset, so
 * that links inside backticks are never picked up.
 */
function maskInlineCode(text: string): string {
	const runPattern = /`+/g;
	const runs: { start: number; length: number }[] = [];
	let run: RegExpExecArray | null;

	while ((run = runPattern.exec(text)) !== null) {
		runs.push({ start: run.index, length: run[0].length });
	}

	const characters = text.split("");

	for (let index = 0; index < runs.length; index += 1) {
		const open = runs[index];
		let close = -1;

		for (let candidate = index + 1; candidate < runs.length; candidate += 1) {
			if (runs[candidate].length === open.length) {
				close = candidate;
				break;
			}
		}

		if (close === -1) {
			continue;
		}

		for (let position = open.start; position < runs[close].start + runs[close].length; position += 1) {
			characters[position] = " ";
		}

		index = close;
	}

	return characters.join("");
}

/** Adds an embed to the list, unless its path is external or not an image. */
function addEmbed(
	embeds: ImageEmbed[],
	raw: string,
	pathStart: number,
	pathEnd: number,
	encoding: PathEncoding,
): void {
	if (raw === "" || isExternalPath(raw)) {
		return;
	}

	const path = encoding === "plain" ? raw : decodeLinkPath(raw);
	if (!isImagePath(path)) {
		return;
	}

	embeds.push({ raw, path, pathStart, pathEnd, encoding });
}

/** Collects `![[path|alias]]` embeds of a single line. */
function collectWikiEmbeds(text: string, offset: number, embeds: ImageEmbed[]): void {
	const pattern = /!\[\[([^\]\n]*)\]\]/g;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(text)) !== null) {
		const inner = match[1];
		const innerStart = match.index + "![[".length;
		let from = 0;
		let to = inner.length;

		// Everything after the first `|` is an alias or a size, everything after
		// the first `#` is a subpath; both stay untouched.
		const alias = inner.indexOf("|");
		if (alias !== -1) {
			to = alias;
		}

		const subpath = inner.indexOf("#");
		if (subpath !== -1 && subpath < to) {
			to = subpath;
		}

		while (from < to && inner[from] === " ") {
			from += 1;
		}
		while (to > from && inner[to - 1] === " ") {
			to -= 1;
		}

		addEmbed(embeds, inner.slice(from, to), offset + innerStart + from, offset + innerStart + to, "plain");
	}
}

/** Collects `![alt](path "title")` embeds of a single line. */
function collectMarkdownEmbeds(text: string, offset: number, embeds: ImageEmbed[]): void {
	const pattern = /!\[[^\]\n]*\]\(([^()\n]*)\)/g;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(text)) !== null) {
		const inner = match[1];
		const innerStart = match.index + match[0].length - ")".length - inner.length;
		let encoding: PathEncoding = "uri";
		let from = 0;
		let to = inner.length;

		while (from < to && /\s/.test(inner[from])) {
			from += 1;
		}
		while (to > from && /\s/.test(inner[to - 1])) {
			to -= 1;
		}

		if (to - from >= 2 && inner[from] === "<" && inner[to - 1] === ">") {
			// An angle-bracketed destination carries the path verbatim.
			from += 1;
			to -= 1;
			encoding = "plain";
		} else {
			// A title, if there is one, is separated from the path by whitespace.
			const title = inner.slice(from, to).search(/\s/);
			if (title !== -1) {
				to = from + title;
			}
		}

		addEmbed(embeds, inner.slice(from, to), offset + innerStart + from, offset + innerStart + to, encoding);
	}
}

/**
 * Finds every embedded image link of a note, in order of appearance. Links
 * inside YAML frontmatter, fenced code blocks and inline code are ignored, as
 * are external addresses and embeds of files that are not images.
 */
export function findImageEmbeds(source: string): ImageEmbed[] {
	const embeds: ImageEmbed[] = [];

	for (const line of findContentLines(source)) {
		const text = maskInlineCode(line.text);

		collectWikiEmbeds(text, line.start, embeds);
		collectMarkdownEmbeds(text, line.start, embeds);
	}

	// The two syntaxes are collected in separate passes over each line.
	embeds.sort((left, right) => left.pathStart - right.pathStart);

	return embeds;
}
