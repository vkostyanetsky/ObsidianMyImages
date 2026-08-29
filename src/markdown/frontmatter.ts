/*
 * Writing single values into the YAML frontmatter of a note.
 *
 * Obsidian offers `processFrontMatter` for this, but it parses the block and
 * writes it back from scratch, which reformats every other property along the
 * way. The properties of a note are the user's, so only the lines that actually
 * carry a new value are touched here and everything else is left byte for byte
 * as it was.
 */

import { findFrontmatterRange, splitLines } from "./lines";

/** One property of the frontmatter, as it is to be written. */
export interface FrontmatterValue {
	/** Name of the property, as it appears before the colon. */
	key: string;
	/** Value to write, already formatted the way YAML expects it. */
	value: string;
}

/** The line break the document uses, defaulting to the Unix one. */
function lineBreakOf(source: string): string {
	return /\r\n/.test(source) ? "\r\n" : "\n";
}

function escapeForPattern(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether the line opens the property at the top level of the block, that is
 * `key:` written flush left, with or without a value behind it.
 */
function opensProperty(line: string, key: string): boolean {
	return new RegExp(`^${escapeForPattern(key)}[ \\t]*:`).test(line);
}

/**
 * Whether the line belongs to the property opened above it: everything that is
 * indented, which covers both a folded value and the items of a list.
 */
function continuesProperty(line: string): boolean {
	return /^[ \t]+\S/.test(line);
}

/** The property as one line of YAML. A blank value leaves the key empty. */
function propertyLine({ key, value }: FrontmatterValue): string {
	return value === "" ? `${key}:` : `${key}: ${value}`;
}

/**
 * Rewrites the body of the frontmatter, replacing the properties that are
 * already there and appending the ones that are not.
 */
function updateBody(body: string[], values: FrontmatterValue[]): string[] {
	const updated: string[] = [];
	const written = new Set<string>();
	let skipping = false;

	for (const line of body) {
		if (skipping && continuesProperty(line)) {
			// A value spanning several lines is replaced as a whole.
			continue;
		}

		skipping = false;

		const value = values.find(
			(candidate) => !written.has(candidate.key) && opensProperty(line, candidate.key),
		);

		if (value === undefined) {
			updated.push(line);
			continue;
		}

		updated.push(propertyLine(value));
		written.add(value.key);
		skipping = true;
	}

	for (const value of values) {
		if (!written.has(value.key)) {
			updated.push(propertyLine(value));
		}
	}

	return updated;
}

/**
 * Writes the values into the frontmatter of the note, adding a block when there
 * is none. Returns the note as it has to be stored, or `null` when it already
 * reads exactly like that and therefore does not need to be written at all.
 */
export function setFrontmatterValues(source: string, values: FrontmatterValue[]): string | null {
	if (values.length === 0) {
		return null;
	}

	const lineBreak = lineBreakOf(source);
	const lines = splitLines(source).map((line) => line.text);
	const range = findFrontmatterRange(splitLines(source));

	if (range === null) {
		const block = ["---", ...values.map(propertyLine), "---"];

		// A note that holds nothing gets the block on its own; anything else
		// keeps its first line one blank line below.
		return source === ""
			? block.join(lineBreak) + lineBreak
			: [...block, "", ...lines].join(lineBreak);
	}

	const body = lines.slice(range.start, range.end);
	const updated = updateBody(body, values);

	if (updated.length === body.length && updated.every((line, index) => line === body[index])) {
		return null;
	}

	return [...lines.slice(0, range.start), ...updated, ...lines.slice(range.end)].join(lineBreak);
}
