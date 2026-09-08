# My Images 🖼️ 🏷️ 🐦

An Obsidian plugin that keeps the notes of my image folders in shape: naming their images after them, dating them after the tweet they were made from.

> **A personal tool.** This plugin exists to simplify my work with image collections, and its behaviour is shaped entirely by how I structure my notes to manage them. It is not intended to be a general-purpose Obsidian plugin, and there are no plans to submit it to the community catalogue. You are welcome to use it if your notes happen to follow the same conventions, but nothing here is designed with anyone else's workflow in mind.

## ✨ What it does

Two features, three commands, and one run the plugin can make by itself once the vault is opened:

| Feature | Commands |
| --- | --- |
| [Image notes](#image-notes) | **Update current note**, **Update notes in image folders** |
| [Reaction base](#reaction-base) | **Rebuild views of the reaction base** |

<a id="image-notes"></a>

## 🖼️ Image notes

The notes kept in the **image folders** named in the settings are brought into shape by a handful of **rules**, each switched on and configured in the settings on its own:

| Rule | What it does |
| --- | --- |
| [Renaming images](#renaming-images) | Names the images embedded in a note after the note itself |
| [Date of a tweet](#date-of-a-tweet) | Writes the day the tweet the note links to was posted on into the note |

The rules are applied in that order, one note at a time. **A note is only written when a rule would leave it saying something other than it does**, so a run over folders that are already in order writes nothing and leaves a thousand modification dates alone. A rule that goes wrong does not hold up the ones behind it — the renaming of the images and the date of a tweet have nothing to do with each other — and the notice says what was done and what was not.

### Update current note

Applies every switched-on rule to the note that is open and reports what each of them came to.

The command is not offered at all unless the note in front of you sits in one of the image folders. On anything else it does not appear in the command palette, and a shortcut bound to it does nothing.

The links a renaming rewrites are edited in the open note itself, as one undoable step; a property is written to the file.

### Update notes in image folders

The same, for every note of the image folders, one note after the other. Notes that are open have their links rewritten through the editor; the rest are written straight to disk.

A single notice sums the run up — how many notes were written, out of how many — and names every rule that had to be left undone, with the note it belongs to.

### Updating when the vault is opened

With **Update when the vault is opened** switched on, the run above happens once by itself: right after Obsidian has read the vault in, the notes of the image folders are gone through and whatever is out of place is put right. It reports only when it wrote something or ran into trouble.

It is the one run nobody asks for. The plugin does not listen to the vault: a note is never looked at while it is being written, and images never move under your hands. Everything else happens when a command is run.

<a id="renaming-images"></a>

## 🏷️ Renaming images

It renames every image embedded in the note after the note itself, numbering the images in the order they first appear:

```text
{note name} {number}.{extension}
```

A note that names a single image after itself needs no numbering to tell its images apart, so that one image is simply:

```text
{note name}.{extension}
```

Before:

```markdown
![[Test 1.png]]

![[Pasted image 20260808172735.png]]

![[Test 10.png]]
```

After (with eleven images in the note):

```markdown
![[Test 01.png]]

![[Test 03.png]]

![[Test 05.png]]
```

### Rules

- Numbers start at `1` and are padded to the width of the total: `1`…`9` for up to nine images, `01`…`99` for up to ninety-nine, `001`…`999` beyond that.
- A note with a single image to name gives it its own name, without a number — `Test.png`, not `Test 1.png`. As soon as a second image joins the note, both are numbered again.
- The extension of the image is kept as it is, including its case. Recognised extensions are `png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp`, `svg` and `avif`, compared case-insensitively.
- Images stay in the folder they are in; only the file name changes.
- An image used several times in the note is renamed once, takes the number of its first appearance, and does not widen the numbering.
- Both `![[Image.png]]` and `![](Image.png)` are understood, in any folder, and the alias, the size (`![[Image.png|300]]`) and the title of a link are left untouched.
- Links inside YAML frontmatter, fenced code blocks and inline code are ignored, as are external addresses and embeds of files that are not images.
- An image another note links to as well is left alone: it belongs to no single note, so renaming it after this one would only take it away from the others. Such an image takes no number either, and the notice says how many were left out.
- Links that do not resolve to a file are skipped: they take no number, and the notice says how many were left out.
- An image that already has the right name for its position is left alone, and so is its link.

The renaming is planned in full before anything happens. If a name the plan needs is already taken by a file outside the note, nothing is renamed at all and a notice names both the image that wanted the name and the name it could not take — usually a leftover file that sits in the folder without being embedded anywhere. Every image is renamed straight to its new name as soon as that name is free. Images that take names from each other — a note where `Test 10.png` has to become `Test 05.png` while another image becomes `Test 10.png` — would each wait for the other, so one of them is moved to a temporary name to open the ring and the rest follows it. No file is ever overwritten, and an image whose name is free is renamed once, not twice. When a rename fails halfway through, the ones that already happened are taken back.

Renaming goes through the Obsidian file manager, so it honours the **Automatically update internal links** setting: when it is on, Obsidian rewrites the links itself and the plugin only checks the result; when it is off, the plugin rewrites the links of the current note in one undoable step. Links to the images from *other* notes are Obsidian's business either way.

<a id="date-of-a-tweet"></a>

## 🐦 Date of a tweet

A note made from something seen on X usually keeps the address it came from. The day the tweet was posted on is written in that address already — the id of a tweet carries the millisecond it was handed out at — so the plugin reads the day off the link and writes it into the note:

```yaml
---
date: 2017-04-06
---
```

- Both `x.com` and `twitter.com` are recognised, with any subdomain (`mobile.twitter.com`) and with anything the address carries behind the id (`?s=20`, `/photo/1`). The address has to carry its scheme, `https://` or `http://`, so that a word ending in `x.com` is never taken for a link.
- A link in the frontmatter counts as well — that is where a note tends to keep the address it was made from — while fenced code blocks are left alone.
- A note linking to several tweets is dated after the first of them, which is the one it was written about.
- The day is the one it was in **UTC**, so that the same link always comes out as the same date, wherever the vault is opened.
- Nothing is fetched from the network, so the date of a link is known even for a tweet that has since been deleted.
- **A date the note already carries is written over.** The id of the tweet is what the day is taken from; a date typed by hand loses.
- Tweets from before November 2010 carry no timestamp in their ids — those were counted up one by one — and a link to one of them is left alone.
- The property the date goes into is named in the settings; blank falls back to `date`.

<a id="reaction-base"></a>

## 🗃️ Reaction base

The pictures of my collections are tagged by the reaction they are good for — `Reaction/Approve`, `Reaction/Funny`, `Reaction/Anger` — and a base file shows them as a wall of cards. Browsing that wall by reaction means a view per reaction, and keeping a couple of dozen views in step with the tags by hand is not work worth doing twice.

**Rebuild views of the reaction base** does it instead. Every note of the vault carrying the reaction tag is counted, and the base comes out with one view per tag below it:

```yaml
views:
  - type: cards
    name: Everything          # the name given in the settings
    filters:
      and:
        - 'file.hasTag("Reaction")'
    # …the look of the view the file opened with
  - type: cards
    name: Anger
    filters:
      and:
        - 'file.hasTag("Reaction/Anger")'
    # …and the same look again
  - type: cards
    name: Approve
    filters:
      and:
        - 'file.hasTag("Reaction/Approve")'
```

- **The header of the file is yours.** Its filters, its formulas and its properties are read and written back untouched — the folders the collections live in, and the reaction tag itself, are filtered there, not in the views.
- **The first view of the file is the model every generated view is cut from.** Whatever it says about the type of the view, the image it shows, the size of its cards and the order it sorts in is said by every view of the rebuilt file too. Its name and its filter are not kept: those are the plugin's to write, and the row of views is replaced whole on every run — the first one included.
- **The one view that is not a reaction is named in the settings, and unnamed it is not written at all.** That is the view of every reaction there is, and it stands ahead of the rest.
- **The view of every reaction** gathers the lot: `hasTag` counts the tags below the one it is given, so a single `file.hasTag("Reaction")` does it. It stands first, so the base opens on the whole wall of them.
- **A view is named after its tag**, the reaction tag taken off the front: `Reaction/Approve` becomes **Approve**, and a deeper `Reaction/Approve/Loudly` becomes **Approve/Loudly**.
- **A tag of two words run together is spelled out the way it is read**: `Reaction/SoPleased` becomes **So pleased**. An abbreviation is left alone — `Reaction/NSFW` stays **NSFW**, `Reaction/3D` stays **3D** — and the tag the view filters by is the tag as written, whatever its view is called.
- **The views after the first are ordered by name**, from А to Я in Russian order whatever language Obsidian runs in, so that a row of two dozen views is a row one can find a name in.
- **A note of several reactions shows up under each of them.** The views are a way of browsing the collections, not a filing system: a picture one answers a joke with and applauds with as well is worth finding under both.
- **A note carrying the reaction tag and nothing below it** is counted among all of them and has no view of its own. There is nothing to call such a view, and nothing to tell one reaction from another in it.
- **The whole vault is counted, not one folder.** What is then shown is up to the filters of the base: a base that only looks at a few folders shows the reactions of those folders, whatever the tags of the rest of the vault say.
- **Nothing is written unless the file would come out saying something else**, so a run that finds the views in order leaves the modification date of the base alone.
- The file is read as YAML and written back as YAML, which normalizes the way it is laid out — the values are the ones you gave, the quoting and the line breaks are Obsidian's own.

The base is never rebuilt by itself, not even when the vault is opened: tags change all day long, and a file rewritten behind one's back is a file one stops trusting.

## 🐞 Debugging output

Everything the plugin does to the vault is written to the developer console (`Ctrl+Shift+I` → **Console**, filter by `[My Images]`): how many notes of the vault a run considered, every image rename, every image left alone because other notes use it — named one by one — every note that is written back, with the number of links rewritten in it, and every date taken from a tweet. Notes that could not be processed come out as warnings.

## ⚙️ Settings

| Setting | What it does |
| --- | --- |
| **Image folders** | The folders the rules above are applied to, subfolders included. Any number of them; each row picks a folder of the vault, and blank rows are ignored. The vault root cannot be given as a folder — a folder has to be named. |
| **Update when the vault is opened** | Whether the notes of those folders are gone through once at startup. Switching it on changes nothing right away — it takes effect the next time the vault is opened. To go through the folders now, run the command. |
| **Rename images** | Whether the images of a note are named after the note at all. |
| **Fill in the date of the tweet** | Whether the day a linked tweet was posted on is written into the note at all. |
| **Date** | The property that day is written to. Blank falls back to `date`. |
| **Base file** | The `.base` file whose views are written anew. Nothing is written until one is named. |
| **Reaction tag** | The tag the reactions sit under, written without a leading `#`. The tags below it are what the views are made of. |
| **View of every reaction** | The name of the view that gathers every reaction there is and stands first in the base. Blank leaves it out. |

Folders are matched without regard to case, and a folder holds everything below it, so `Projects` covers `Projects/2026/Trip.md` as well.

The tab does not build itself: it says what it holds through `getSettingDefinitions()`, and Obsidian both lays the rows out and finds them by the search of the preferences. The one row built by hand is **Reaction tag**, which offers the top-level tags already in use — something no control of the preferences does on its own.

## 🙂 Usage

Open a note of an image folder, then run **Update current note** from the command palette (`Ctrl/Cmd+P`). To go through every note of those folders instead, run **Update notes in image folders**.

To write the views of the reaction base anew, run **Rebuild views of the reaction base**.

All three work only when they are run. Nothing is renamed while a note is being edited, no note is written unless something in it would change, and the base is written only when its views would come out differently.

## 🔨 Building

Requires Node.js 18 or newer. The plugin itself asks for Obsidian 1.13.0: the reaction base is a Bases file, which came with 1.9.0, and the settings tab describes itself through `getSettingDefinitions()`, which came with 1.13.0.

```bash
npm install
```

Production build — type-checks and writes `main.js`:

```bash
npm run build
```

Development build with rebuild-on-change:

```bash
npm run dev
```

Unit tests:

```bash
npm test
```

The linter:

```bash
npm run lint
```

It runs the recommended set of [eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin-obsidianmd), which brings the core rules of ESLint and the type-checked rules of typescript-eslint with it and adds the ones that only mean anything inside a plugin — an API newer than `minAppVersion` claims, an event that is never unregistered, an `innerHTML` where an element should be built. What it is told to leave alone, and why, is written out in [eslint.config.mjs](eslint.config.mjs): the build and the deployment run in Node rather than in Obsidian, and the debugging output of [src/log.ts](src/log.ts) is the one place the console is written to on purpose.

## 📦 Deploying to a vault

The vault lives in a `.env` file of your own, which is not in the repository. Copy the example and put your path in it:

```bash
cp .env.example .env
```

```ini
OBSIDIAN_VAULT=D:\Me\Vault
```

Then build and copy the plugin into that vault in one step:

```bash
npm run deploy
```

It writes `main.js`, `manifest.json` and `styles.css` to `<vault>/.obsidian/plugins/my-images/`, creating the folder if it is not there. A different vault can be given for a single run — as the first argument (`node scripts/deploy.mjs "C:\Path\To\Vault"`) or in an `OBSIDIAN_VAULT` environment variable, both of which win over `.env`. A folder without `.obsidian` inside is refused, nothing is copied when `main.js` has not been built yet, and a missing `.env` is reported rather than guessed around.

In VS Code the same thing runs from the command palette (`Ctrl+Shift+P`) → **Tasks: Run Task**:

- **Deploy plugin to Obsidian vault** — builds, then copies;
- **Copy plugin to Obsidian vault (no build)** — copies whatever `main.js` is there right now, handy next to `npm run dev`.

Both are defined in [.vscode/tasks.json](.vscode/tasks.json) and can be given a keyboard shortcut of their own through **Preferences: Open Keyboard Shortcuts (JSON)**:

```json
{
	"key": "ctrl+alt+d",
	"command": "workbench.action.tasks.runTask",
	"args": "Deploy plugin to Obsidian vault"
}
```

After the first deployment, restart Obsidian (or reload the app) and enable **My Images** in **Settings → Community plugins**; after later ones, reloading the plugin is enough.

Alternatively, to develop against a live vault without copying anything, clone this repository straight into `<your vault>/.obsidian/plugins/my-images/`, run `npm run dev`, and reload the plugin after each change.

## 🗂️ Project layout

| Path | Purpose |
| --- | --- |
| [src/main.ts](src/main.ts) | Plugin and command registration |
| [src/markdown/lines.ts](src/markdown/lines.ts) | Markdown analysis: lines, frontmatter, fenced code blocks |
| [src/markdown/edits.ts](src/markdown/edits.ts) | Text edits and how to apply them to a string |
| [src/markdown/frontmatter.ts](src/markdown/frontmatter.ts) | Writing single properties without reformatting the rest |
| [src/images/links.ts](src/images/links.ts) | Finding and reading embedded image links |
| [src/images/paths.ts](src/images/paths.ts) | Vault path arithmetic |
| [src/images/plan.ts](src/images/plan.ts) | New names, name conflicts and the resulting link edits |
| [src/images/rename.ts](src/images/rename.ts) | Carrying out a renaming safely, and its outcome |
| [src/images/rule.ts](src/images/rule.ts) | The renaming of the images as a rule |
| [src/images/vault-host.ts](src/images/vault-host.ts) | Binding the renaming to the vault, to the open note and to the file |
| [src/images/types.ts](src/images/types.ts) | Data types of the renaming |
| [src/image-notes/rules.ts](src/image-notes/rules.ts) | What a rule is, and the run that applies the rules to a note |
| [src/image-notes/run.ts](src/image-notes/run.ts) | Running over the notes of the image folders |
| [src/reaction-base/tags.ts](src/reaction-base/tags.ts) | Sorting the notes of the vault into the groups the base shows |
| [src/reaction-base/base.ts](src/reaction-base/base.ts) | Turning those groups into the views of the base file |
| [src/reaction-base/run.ts](src/reaction-base/run.ts) | Reading the reaction base and writing it back |
| [src/tweets/tweets.ts](src/tweets/tweets.ts) | Reading the day a tweet was posted on out of its address |
| [src/tweets/rule.ts](src/tweets/rule.ts) | The date of a tweet as a rule |
| [src/editor/apply-edits.ts](src/editor/apply-edits.ts) | Applying edits to the Obsidian editor as one transaction |
| [src/editor/position-mapping.ts](src/editor/position-mapping.ts) | Carrying cursors and selections across the edits |
| [src/settings/settings.ts](src/settings/settings.ts) | The stored settings, and which notes the folders hold |
| [src/settings/tab.ts](src/settings/tab.ts) | What the settings tab holds, as Obsidian renders and searches it |
| [src/settings/tag-suggest.ts](src/settings/tag-suggest.ts) | Suggesting the top-level tags of the vault while one is typed |
| [src/log.ts](src/log.ts) | Debugging output |
| [styles.css](styles.css) | Nothing, now that the settings tab is laid out by Obsidian |
| [scripts/deploy.mjs](scripts/deploy.mjs) | Copying the built plugin into a vault |
| [.env.example](.env.example) | Where the vault path goes, once copied to `.env` |
| [.vscode/tasks.json](.vscode/tasks.json) | VS Code tasks for deploying |
| [eslint.config.mjs](eslint.config.mjs) | What the linter looks at, and what it is told to leave alone |
| [tests/](tests/) | Unit tests |

The logic is independent of the Obsidian API and carries the bulk of the test suite. It reaches the vault only through an interface — `ImageRenameHost` in [src/images/rename.ts](src/images/rename.ts) — which [src/images/vault-host.ts](src/images/vault-host.ts) implements against Obsidian and the tests implement in memory.

A new rule of the image folders is a `NoteRule`: it is handed one note and answers what it did to it, what it found already in order, or why it could not be applied. Adding one means a folder under `src/`, a line in `MyImagesPlugin.rules()`, and a section in the settings tab.

## 🙏 Credits

Scaffolded and reviewed with the help of the [obsidian-plugin-skill](https://github.com/gapmiss/obsidian-plugin-skill) for Claude.
