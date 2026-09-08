import { fileExtension } from "../images/paths";

/** The renaming rule: images are named after the note they are embedded in. */
export interface RenameImagesSettings {
	/** Whether the images of a note are renamed at all. */
	enabled: boolean;
}

/** The tweet date rule: the day the tweet a note links to was posted on. */
export interface TweetDateSettings {
	/** Whether the date is worked out at all. */
	enabled: boolean;
	/** The property of the note the date is written to. */
	property: string;
}

/**
 * What a run over the notes of the image folders needs, whichever rules take
 * part in it.
 */
export interface ImageNotesSettings {
	/**
	 * Folders whose notes the rules apply to, as vault-relative paths, exactly
	 * as the user typed them.
	 */
	folders: string[];
	/** Whether those notes are gone through once when the vault is opened. */
	autoUpdate: boolean;
	renameImages: RenameImagesSettings;
	tweetDate: TweetDateSettings;
}

/**
 * The base of the memes: the `.base` file whose views the plugin writes, and
 * the tag the memes it shows sit under.
 */
export interface MemeBaseSettings {
	/** Vault path of that file, its `.base` extension included. */
	file: string;
	/** The top-level tag of the memes, such as `Memes`. */
	tag: string;
	/**
	 * The name of the view of every meme there is. Blank leaves that view out
	 * of the base: the two views that are not one tag of the memes are the only
	 * ones without a name of their own, and an unnamed one is not written.
	 */
	allView: string;
	/** The name of the view of the memes that carry no tag below that one. */
	topicView: string;
}

/** Everything the plugin remembers between sessions. */
export interface MyImagesSettings {
	imageNotes: ImageNotesSettings;
	memeBase: MemeBaseSettings;
}

/** The property the date of a tweet is written to unless it is renamed. */
export const DEFAULT_TWEET_DATE_PROPERTY = "date";

/** The settings a fresh installation starts with. */
export const DEFAULT_SETTINGS: MyImagesSettings = {
	imageNotes: {
		folders: [],
		autoUpdate: false,
		// The renaming is what the plugin was written for, so it takes part
		// from the start. Without a folder there is nothing to go through.
		renameImages: { enabled: true },
		tweetDate: { enabled: false, property: DEFAULT_TWEET_DATE_PROPERTY },
	},
	// Nothing is guessed at here: a base of somebody else's making would be
	// written over, so the file, the tag and the views that are not tags of the
	// memes are all named by hand or not at all.
	memeBase: { file: "", tag: "", allView: "", topicView: "" },
};

/**
 * Trims a path as the user typed it down to a vault-relative one: outer
 * whitespace, repeated separators and leading and trailing slashes are dropped.
 * The vault root, however it is written, comes back as an empty string.
 */
export function normalizeVaultPath(path: string): string {
	return path.trim().replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}

/** The same, for a path that names a folder. */
export function normalizeFolder(folder: string): string {
	return normalizeVaultPath(folder);
}

/**
 * Trims a property as the user typed it. A property that names nothing falls
 * back to its default, so that a run never writes to a nameless one.
 */
export function normalizeProperty(property: string, fallback: string): string {
	return property.trim() === "" ? fallback : property.trim();
}

/**
 * Whether a vault path sits in the folder or in one of its subfolders. Paths are
 * compared case-insensitively, and a folder that names nothing — a blank row, or
 * the vault root — holds nothing.
 */
export function isInFolder(path: string, folder: string): boolean {
	const normalized = normalizeFolder(folder);

	if (normalized === "") {
		return false;
	}

	return path.toLowerCase().startsWith(`${normalized.toLowerCase()}/`);
}

/** Whether any folder of the settings names a folder of the vault at all. */
export function hasFolders(folders: string[]): boolean {
	return folders.some((folder) => normalizeFolder(folder) !== "");
}

/** Whether a vault path sits in any of the folders. */
export function isInAnyFolder(path: string, folders: string[]): boolean {
	return folders.some((folder) => isInFolder(path, folder));
}

/** Whether the path names a Markdown note. */
export function isMarkdownPath(path: string): boolean {
	return fileExtension(path).toLowerCase() === "md";
}

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback: string): string {
	return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

/** The folders as they were stored, anything that is not a path left out. */
function readFolders(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((folder): folder is string => typeof folder === "string")
		: [];
}

/**
 * Reads the settings back as they were stored, filling in everything that is
 * missing or of the wrong shape with its default.
 *
 * The image folders were once part of a larger plugin of mine, MyDailies, and
 * they are read from a `data.json` of that one just as well: the block they sat
 * in there is the block they sit in here, and the flat settings of the days
 * when the renaming was the only rule are still understood.
 */
export function readSettings(data: unknown): MyImagesSettings {
	const stored = asRecord(data);
	const imageNotes = asRecord(stored.imageNotes);
	const renameImages = asRecord(imageNotes.renameImages);
	const tweetDate = asRecord(imageNotes.tweetDate);
	const memeBase = asRecord(stored.memeBase);
	const defaults = DEFAULT_SETTINGS.imageNotes;

	return {
		imageNotes: {
			folders: readFolders(imageNotes.folders ?? stored.imageFolders),
			autoUpdate: asBoolean(
				imageNotes.autoUpdate,
				asBoolean(stored.autoRenameImages, defaults.autoUpdate),
			),
			renameImages: {
				enabled: asBoolean(renameImages.enabled, defaults.renameImages.enabled),
			},
			tweetDate: {
				enabled: asBoolean(tweetDate.enabled, defaults.tweetDate.enabled),
				property: normalizeProperty(
					asString(tweetDate.property, DEFAULT_TWEET_DATE_PROPERTY),
					DEFAULT_TWEET_DATE_PROPERTY,
				),
			},
		},
		memeBase: {
			file: asString(memeBase.file, DEFAULT_SETTINGS.memeBase.file),
			tag: asString(memeBase.tag, DEFAULT_SETTINGS.memeBase.tag),
			allView: asString(memeBase.allView, DEFAULT_SETTINGS.memeBase.allView),
			topicView: asString(memeBase.topicView, DEFAULT_SETTINGS.memeBase.topicView),
		},
	};
}
