import type { App } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";

import type MyImagesPlugin from "../main";
import { DEFAULT_TWEET_DATE_PROPERTY, normalizeProperty } from "./settings";
import { FolderSuggest } from "./folder-suggest";

/** What a switch of a rule says under its name. */
const RULE_SWITCH_DESCRIPTION = "Whether this is applied to a note of the image folders at all.";

/** The settings of the plugin, as they are shown in the Obsidian preferences. */
export class MyImagesSettingTab extends PluginSettingTab {
	private readonly plugin: MyImagesPlugin;

	constructor(app: App, plugin: MyImagesPlugin) {
		super(app, plugin);

		this.plugin = plugin;
	}

	display(): void {
		this.containerEl.empty();

		this.displayImageNotes();
		this.displayRenameImages();
		this.displayTweetDate();
	}

	/** What every rule shares: which notes it works on, and when. */
	private displayImageNotes(): void {
		new Setting(this.containerEl)
			.setName("Image folders")
			.setDesc(
				"Folders whose notes the rules below are applied to, subfolders included. " +
					"Blank rows are ignored. A note is only ever written when one of its " +
					"rules would leave it saying something else than it does.",
			)
			.setHeading();

		this.displayFolders();

		new Setting(this.containerEl)
			.setName("Update when the vault is opened")
			.setDesc(
				"Go through the notes of these folders once, right after the vault has been " +
					"read in. Nothing is watched afterwards; to go through the folders at " +
					"any other moment, run one of the two commands.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.imageNotes.autoUpdate)
					.onChange(async (value) => {
						this.plugin.settings.imageNotes.autoUpdate = value;

						// Switching this on never starts a run of its own: the
						// folders are gone through when the vault is opened the
						// next time, or when the command is run.
						await this.plugin.saveSettings();
					}),
			);
	}

	/** The renaming rule: images are named after the note they sit in. */
	private displayRenameImages(): void {
		new Setting(this.containerEl)
			.setName("Renaming images")
			.setDesc(
				"Renames the images embedded in a note after the note itself, numbering " +
					"them in order of appearance, and points the links of the note at the " +
					"new names. An image another note shows as well is left alone.",
			)
			.setHeading();

		this.displaySwitch(
			"Rename images",
			RULE_SWITCH_DESCRIPTION,
			() => this.plugin.settings.imageNotes.renameImages.enabled,
			(value) => {
				this.plugin.settings.imageNotes.renameImages.enabled = value;
			},
		);
	}

	/** The tweet rule: the day the tweet a note links to was posted on. */
	private displayTweetDate(): void {
		new Setting(this.containerEl)
			.setName("Date of a tweet")
			.setDesc(
				"Works out the day the tweet a note links to was posted on — from the " +
					"address alone, nothing is fetched — and writes it into the note. A " +
					"note linking to several tweets is dated after the first of them, and " +
					"a date it already carries is written over.",
			)
			.setHeading();

		this.displaySwitch(
			"Fill in the date of the tweet",
			RULE_SWITCH_DESCRIPTION,
			() => this.plugin.settings.imageNotes.tweetDate.enabled,
			(value) => {
				this.plugin.settings.imageNotes.tweetDate.enabled = value;
			},
		);

		this.displayProperty(
			"Date",
			DEFAULT_TWEET_DATE_PROPERTY,
			() => this.plugin.settings.imageNotes.tweetDate.property,
			(value) => {
				this.plugin.settings.imageNotes.tweetDate.property = value;
			},
		);
	}

	/** One row per image folder, plus the button that adds another one. */
	private displayFolders(): void {
		this.plugin.settings.imageNotes.folders.forEach((folder, index) => {
			new Setting(this.containerEl)
				.setClass("my-images-folder-row")
				.addSearch((search) => {
					const save = async (value: string): Promise<void> => {
						this.plugin.settings.imageNotes.folders[index] = value;
						await this.plugin.saveSettings();
					};

					search.inputEl.setAttribute("aria-label", "Image folder");
					search
						.setPlaceholder("Folder in the vault")
						.setValue(folder)
						.onChange((value) => {
							void save(value);
						});

					new FolderSuggest(this.app, search.inputEl, (path) => {
						void save(path);
					});
				})
				.addExtraButton((button) =>
					button
						.setIcon("trash")
						.setTooltip("Remove folder")
						.onClick(async () => {
							this.plugin.settings.imageNotes.folders.splice(index, 1);
							await this.plugin.saveSettings();
							this.display();
						}),
				);
		});

		new Setting(this.containerEl).setClass("my-images-folder-add").addButton((button) =>
			button
				.setButtonText("Add folder")
				.setTooltip("Add a folder to the list")
				.onClick(async () => {
					this.plugin.settings.imageNotes.folders.push("");
					await this.plugin.saveSettings();
					this.display();
				}),
		);
	}

	/** The switch a rule is turned on and off by. */
	private displaySwitch(
		name: string,
		description: string,
		read: () => boolean,
		write: (value: boolean) => void,
	): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(description)
			.addToggle((toggle) =>
				toggle.setValue(read()).onChange(async (value) => {
					write(value);
					await this.plugin.saveSettings();
				}),
			);
	}

	/** The property one value of a rule ends up in. */
	private displayProperty(
		name: string,
		fallback: string,
		read: () => string,
		write: (value: string) => void,
	): void {
		new Setting(this.containerEl).setName(name).addText((text) =>
			text
				.setPlaceholder(fallback)
				.setValue(read())
				.onChange(async (value) => {
					// A property that names nothing would have no line to write
					// to, so the default steps in until something is typed again.
					write(normalizeProperty(value, fallback));
					await this.plugin.saveSettings();
				}),
		);
	}
}
