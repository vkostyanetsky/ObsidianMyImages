/**
 * How the path of an embed is written, and therefore how it has to be read and
 * written back: wikilinks carry the path verbatim, Markdown links carry it
 * percent-encoded.
 */
export type PathEncoding = "plain" | "uri";

/** An embedded image link found in a note. */
export interface ImageEmbed {
	/** Path exactly as written in the note, without alias, size or title. */
	raw: string;
	/** `raw` after decoding, i.e. the path as it points into the vault. */
	path: string;
	/** Offset of the first character of `raw` within the source. */
	pathStart: number;
	/** Offset just past the last character of `raw`. */
	pathEnd: number;
	/** How `raw` has to be encoded when it is written back. */
	encoding: PathEncoding;
}

/** A vault file, reduced to what the renaming logic needs. */
export interface VaultFile {
	/** Vault-relative path, including the file name. */
	path: string;
	/** File extension without the dot, in its original case. */
	extension: string;
}

/** An embed together with the file it points at, if any. */
export interface ResolvedEmbed {
	embed: ImageEmbed;
	/** The file the embed resolves to, or `null` for a broken link. */
	file: VaultFile | null;
}

/** A single file rename of the plan. */
export interface RenameEntry {
	/** The file as it is named right now. */
	file: VaultFile;
	/** Vault-relative path the file has to end up at. */
	targetPath: string;
}

/** Everything that has to happen to the images of one note. */
export interface RenamePlan {
	/** One entry per unique image, in order of first appearance. */
	entries: RenameEntry[];
	/** Number of image embeds that do not resolve to a vault file. */
	unresolved: number;
	/** Number of images that other notes link to as well and are left alone. */
	shared: number;
}

/** A file that has been renamed, remembered by both of its names. */
export interface RenamedFile {
	/** Path the file had before the operation. */
	originalPath: string;
	/** The file, already carrying its new path. */
	file: VaultFile;
}
