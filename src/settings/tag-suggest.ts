import type { App } from "obsidian";
import { AbstractInputSuggest, getAllTags } from "obsidian";

/**
 * Offers the top-level tags of the vault while one is being typed: of
 * `Memes/Funny` only `Memes` is offered, that being the kind of tag the memes
 * are gathered under.
 *
 * The tags are gone through once, when the first suggestion is asked for, and
 * kept for as long as the settings tab is open. A tag added in the meantime is
 * not offered, but can still be typed out by hand.
 */
export class TopLevelTagSuggest extends AbstractInputSuggest<string> {
	private readonly onPick: (tag: string) => void;
	private tags: string[] | null = null;

	constructor(app: App, input: HTMLInputElement, onPick: (tag: string) => void) {
		super(app, input);

		this.onPick = onPick;
	}

	protected getSuggestions(query: string): string[] {
		const wanted = query.trim().toLowerCase();

		return this.topLevelTags().filter((tag) => tag.toLowerCase().includes(wanted));
	}

	renderSuggestion(tag: string, el: HTMLElement): void {
		el.setText(tag);
	}

	selectSuggestion(tag: string): void {
		this.setValue(tag);
		this.onPick(tag);
		this.close();
	}

	/** Every tag of the vault, cut down to its first part and named once. */
	private topLevelTags(): string[] {
		if (this.tags !== null) {
			return this.tags;
		}

		// Keyed in lower case, so that one tag written in two ways is offered
		// once, in the spelling that was met first.
		const found = new Map<string, string>();

		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			const tags = cache === null ? null : getAllTags(cache);

			for (const tag of tags ?? []) {
				const top = tag.replace(/^#+/, "").split("/")[0].trim();

				if (top !== "" && !found.has(top.toLowerCase())) {
					found.set(top.toLowerCase(), top);
				}
			}
		}

		this.tags = [...found.values()].sort((left, right) => left.localeCompare(right));

		return this.tags;
	}
}
