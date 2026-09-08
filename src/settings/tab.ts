import type { App, SettingDefinitionItem, SettingGroupItem } from "obsidian";
import { PluginSettingTab } from "obsidian";

import type MyImagesPlugin from "../main";
import { DEFAULT_TWEET_DATE_PROPERTY, normalizeProperty } from "./settings";
import { TopLevelTagSuggest } from "./tag-suggest";

/** What a switch of a rule says under its name. */
const RULE_SWITCH_DESCRIPTION = "Whether this is applied to a note of the image folders at all.";

/** One row of the image folder list, by the number it stands at. */
const FOLDER_KEY = /^imageNotes\.folders\.(\d+)$/;

/** What one control of the tab reads from, and what it writes back to. */
interface SettingField {
	read: () => unknown;
	write: (value: unknown) => void;
}

function asString(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown): boolean {
	return value === true;
}

/**
 * The settings of the plugin, as they are shown in the Obsidian preferences.
 *
 * The tab says what it holds rather than building itself: Obsidian renders the
 * rows from the definitions below and, from the same definitions, finds them by
 * the search of the preferences. Every control names the setting it stands for,
 * and the two methods at the end are what those names are read and written
 * through.
 */
export class MyImagesSettingTab extends PluginSettingTab {
	private readonly plugin: MyImagesPlugin;

	constructor(app: App, plugin: MyImagesPlugin) {
		super(app, plugin);

		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			this.imageFolders(),
			this.autoUpdate(),
			this.renameImages(),
			this.tweetDate(),
			this.reactionBase(),
		];
	}

	/** Reads the setting one control stands for. */
	getControlValue(key: string): unknown {
		return this.field(key)?.read();
	}

	/** Writes it back, and remembers it. */
	async setControlValue(key: string, value: unknown): Promise<void> {
		const field = this.field(key);

		if (field === undefined) {
			return;
		}

		field.write(value);

		await this.plugin.saveSettings();
	}

	/** The folders the rules are applied to, one row each. */
	private imageFolders(): SettingDefinitionItem {
		const folders = this.plugin.settings.imageNotes.folders;

		return {
			type: "list",
			heading: "Image folders",
			emptyState:
				"No folder is set, so the rules below have nothing to go through. " +
				"A folder holds everything under it, and the vault root cannot be given.",
			items: [...folders.keys()].map((index) => ({
				name: `Folder ${index + 1}`,
				searchable: index === 0,
				control: {
					type: "folder",
					key: `imageNotes.folders.${index}`,
					placeholder: "Folder in the vault",
				},
			})),
			onDelete: (index) => {
				folders.splice(index, 1);
				void this.rebuild();
			},
			addItem: {
				name: "Add folder",
				action: () => {
					folders.push("");
					void this.rebuild();
				},
			},
		};
	}

	/** The one run nobody asks for. */
	private autoUpdate(): SettingDefinitionItem {
		return {
			name: "Update when the vault is opened",
			desc:
				"Go through the notes of the image folders once, right after the vault has " +
				"been read in. Nothing is watched afterwards; to go through the folders at " +
				"any other moment, run one of the two commands. A note is only ever " +
				"written when one of its rules would leave it saying something else than " +
				"it does.",
			control: { type: "toggle", key: "imageNotes.autoUpdate" },
		};
	}

	/** The renaming rule: images are named after the note they sit in. */
	private renameImages(): SettingDefinitionItem {
		return {
			type: "group",
			heading: "Renaming images",
			items: [
				{
					name: "Rename images",
					desc:
						"Names the images embedded in a note after the note itself, numbering " +
						"them in order of appearance, and points the links of the note at " +
						"the new names. An image another note shows as well is left alone. " +
						RULE_SWITCH_DESCRIPTION,
					control: { type: "toggle", key: "imageNotes.renameImages.enabled" },
				},
			],
		};
	}

	/** The tweet rule: the day the tweet a note links to was posted on. */
	private tweetDate(): SettingDefinitionItem {
		return {
			type: "group",
			heading: "Date of a tweet",
			items: [
				{
					name: "Fill in the date of the tweet",
					desc:
						"Works out the day the tweet a note links to was posted on — from " +
						"the address alone, nothing is fetched — and writes it into the " +
						"note. A note linking to several tweets is dated after the first of " +
						"them, and a date it already carries is written over. " +
						RULE_SWITCH_DESCRIPTION,
					control: { type: "toggle", key: "imageNotes.tweetDate.enabled" },
				},
				{
					name: "Date",
					desc: `The property that day is written to. Blank falls back to "${DEFAULT_TWEET_DATE_PROPERTY}".`,
					control: {
						type: "text",
						key: "imageNotes.tweetDate.property",
						placeholder: DEFAULT_TWEET_DATE_PROPERTY,
					},
				},
			],
		};
	}

	/** The reaction base, and the tag the reactions it shows sit under. */
	private reactionBase(): SettingDefinitionItem {
		return {
			type: "group",
			heading: "Reaction base",
			items: [
				{
					name: "Base file",
					desc:
						"Writes the views of this base anew: one per tag below the reaction " +
						"tag, by name, and the one named below ahead of them. The header of " +
						"the file is left as it is, and the view it opened with is the model " +
						"every written view is cut from. Nothing is written until a base is " +
						"named, and nothing is written by itself: run the command.",
					control: {
						type: "file",
						key: "reactionBase.file",
						placeholder: "File in the vault",
						filter: (file) => file.extension === "base",
					},
				},
				this.reactionTag(),
				{
					name: "View of every reaction",
					desc:
						"Stands first in the base, and the base opens on it. It gathers " +
						"every note carrying the reaction tag, the tags below it counting " +
						"as well. Blank leaves that view out.",
					control: {
						type: "text",
						key: "reactionBase.allView",
						placeholder: "Not written",
					},
				},
			],
		};
	}

	/**
	 * The reaction tag. This one row is built by hand: the tags of a vault are
	 * none of the things a control of the preferences offers, and typing one out
	 * without being offered the ones already in use is no fun.
	 */
	private reactionTag(): SettingGroupItem {
		return {
			name: "Reaction tag",
			desc:
				"The tag the reactions sit under, written without a leading #. Every " +
				"note of the vault carrying it takes part, wherever it lives, and the " +
				"tags below it — a Reaction/Approve under a Reaction — are what the " +
				"views are made of.",
			render: (setting) => {
				const save = async (value: string): Promise<void> => {
					this.plugin.settings.reactionBase.tag = value;

					await this.plugin.saveSettings();
				};

				setting.addSearch((search) => {
					search.inputEl.setAttribute("aria-label", "Reaction tag");
					search
						.setPlaceholder("Tag of the vault")
						.setValue(this.plugin.settings.reactionBase.tag)
						.onChange((value) => {
							void save(value);
						});

					new TopLevelTagSuggest(this.app, search.inputEl, (tag) => {
						void save(tag);
					});
				});
			},
		};
	}

	/** Saves the settings and shows the rows that are there afterwards. */
	private async rebuild(): Promise<void> {
		await this.plugin.saveSettings();

		// A folder has come or gone, so it is the rows themselves that have
		// changed and not only what they say.
		this.update();
	}

	/** What the name of a control stands for, or nothing when it names nothing. */
	private field(key: string): SettingField | undefined {
		const settings = this.plugin.settings;
		const folder = FOLDER_KEY.exec(key);

		if (folder !== null) {
			const index = Number(folder[1]);

			return {
				read: () => settings.imageNotes.folders[index] ?? "",
				write: (value) => {
					settings.imageNotes.folders[index] = asString(value);
				},
			};
		}

		switch (key) {
			case "imageNotes.autoUpdate":
				return {
					read: () => settings.imageNotes.autoUpdate,
					write: (value) => {
						// Switching this on never starts a run of its own: the
						// folders are gone through when the vault is opened the
						// next time, or when the command is run.
						settings.imageNotes.autoUpdate = asBoolean(value);
					},
				};
			case "imageNotes.renameImages.enabled":
				return {
					read: () => settings.imageNotes.renameImages.enabled,
					write: (value) => {
						settings.imageNotes.renameImages.enabled = asBoolean(value);
					},
				};
			case "imageNotes.tweetDate.enabled":
				return {
					read: () => settings.imageNotes.tweetDate.enabled,
					write: (value) => {
						settings.imageNotes.tweetDate.enabled = asBoolean(value);
					},
				};
			case "imageNotes.tweetDate.property":
				return {
					read: () => settings.imageNotes.tweetDate.property,
					write: (value) => {
						// A property that names nothing would have no line to
						// write to, so the default steps in until something is
						// typed again.
						settings.imageNotes.tweetDate.property = normalizeProperty(
							asString(value),
							DEFAULT_TWEET_DATE_PROPERTY,
						);
					},
				};
			case "reactionBase.file":
				return {
					read: () => settings.reactionBase.file,
					write: (value) => {
						settings.reactionBase.file = asString(value);
					},
				};
			case "reactionBase.allView":
				return {
					read: () => settings.reactionBase.allView,
					write: (value) => {
						settings.reactionBase.allView = asString(value);
					},
				};
			default:
				return undefined;
		}
	}
}
