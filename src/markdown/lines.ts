/** A single line of a Markdown document together with its absolute offset. */
export interface DocumentLine {
	/** Zero-based line index. */
	index: number;
	/** Offset of the first character of the line within the source. */
	start: number;
	/** Line content without its trailing line break. */
	text: string;
}

/**
 * A fenced code block delimiter: three or more backticks or tildes, indented by
 * at most three spaces, followed by an info string.
 */
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** A closing YAML frontmatter delimiter. */
const FRONTMATTER_DELIMITER_PATTERN = /^---[ \t]*$/;

interface Fence {
	/** Either a backtick or a tilde. */
	marker: string;
	/** Number of marker characters the closing delimiter has to match. */
	length: number;
	/** Text following the delimiter on the opening line. */
	info: string;
}

/** Splits the source into lines, preserving offsets and any kind of line break. */
export function splitLines(source: string): DocumentLine[] {
	const lines: DocumentLine[] = [];
	const lineBreakPattern = /\r\n|\n|\r/g;
	let start = 0;
	let index = 0;
	let lineBreak: RegExpExecArray | null;

	while ((lineBreak = lineBreakPattern.exec(source)) !== null) {
		lines.push({ index, start, text: source.slice(start, lineBreak.index) });
		index += 1;
		start = lineBreak.index + lineBreak[0].length;
	}

	lines.push({ index, start, text: source.slice(start) });

	return lines;
}

function parseFence(text: string): Fence | null {
	const match = FENCE_PATTERN.exec(text);
	if (match === null) {
		return null;
	}

	return { marker: match[1][0], length: match[1].length, info: match[2] };
}

function canOpenFence(fence: Fence): boolean {
	// A backtick fence cannot carry backticks in its info string, otherwise
	// inline code such as ```` ```code``` ```` would open a block.
	return fence.marker !== "`" || !fence.info.includes("`");
}

function closesFence(candidate: Fence, open: Fence): boolean {
	return (
		candidate.marker === open.marker &&
		candidate.length >= open.length &&
		candidate.info.trim() === ""
	);
}

/** The lines a YAML frontmatter block is made of, delimiters left out. */
export interface FrontmatterRange {
	/** Index of the first line of the body, just past the opening `---`. */
	start: number;
	/** Index of the closing `---`, that is one past the last body line. */
	end: number;
}

/**
 * Returns the body of the YAML frontmatter, or `null` when the document does
 * not start with a complete block.
 */
export function findFrontmatterRange(lines: DocumentLine[]): FrontmatterRange | null {
	if (lines.length === 0 || lines[0].text !== "---") {
		return null;
	}

	for (let index = 1; index < lines.length; index += 1) {
		if (FRONTMATTER_DELIMITER_PATTERN.test(lines[index].text)) {
			return { start: 1, end: index };
		}
	}

	// An unterminated block is not frontmatter — treat it as regular content.
	return null;
}

/**
 * Returns the index of the line closing the YAML frontmatter, or `-1` when the
 * document does not start with a complete frontmatter block.
 */
function findFrontmatterEnd(lines: DocumentLine[]): number {
	return findFrontmatterRange(lines)?.end ?? -1;
}

/**
 * Returns the lines carrying regular Markdown content, that is every line
 * outside of the YAML frontmatter and outside of fenced code blocks. The fence
 * delimiters themselves are left out as well.
 */
export function findContentLines(source: string): DocumentLine[] {
	const lines = splitLines(source);
	const content: DocumentLine[] = [];
	let openFence: Fence | null = null;

	for (let index = findFrontmatterEnd(lines) + 1; index < lines.length; index += 1) {
		const line = lines[index];
		const fence = parseFence(line.text);

		if (openFence !== null) {
			if (fence !== null && closesFence(fence, openFence)) {
				openFence = null;
			}
			continue;
		}

		if (fence !== null && canOpenFence(fence)) {
			openFence = fence;
			continue;
		}

		content.push(line);
	}

	return content;
}
