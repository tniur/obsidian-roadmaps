import {
  FuzzySuggestModal,
  renderMatches,
  setIcon,
  TFile,
  type App,
  type FuzzyMatch,
  type SearchMatches,
} from "obsidian";
import { fileKindForPath } from "../domain/paths";
import { KIND_ICONS } from "./kindIcons";

/** Picker-row icon: the node-kind icon the file would produce; a board glyph for .canvas. */
function fileIcon(file: TFile): string {
  return file.extension.toLowerCase() === "canvas" ? "layout-dashboard" : KIND_ICONS[fileKindForPath(file.path)];
}

/** Fuzzy picker over a fixed set of vault files, reused for notes and image sources. */
export class FileSuggestModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private readonly files: TFile[],
    placeholder: string,
    private readonly onChoose: (file: TFile) => void,
  ) {
    super(app);
    this.modalEl.addClass("rm-modal-suggest");
    this.setPlaceholder(placeholder);
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  /**
   * Two-line row: type icon, file name with the fuzzy match highlighted, folder path
   * underneath. Matching runs over the full path (so folder terms still narrow the list),
   * but only the name line shows highlights.
   */
  renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement): void {
    const file = match.item;

    el.addClass("rm-suggest");
    setIcon(el.createSpan({ cls: "rm-suggest__icon" }), fileIcon(file));

    const text = el.createDiv({ cls: "rm-suggest__text" });
    const nameOffset = file.path.length - file.name.length;
    const nameMatches: SearchMatches = [];

    for (const [from, to] of match.match.matches) {
      if (to > nameOffset) {
        nameMatches.push([Math.max(from, nameOffset) - nameOffset, to - nameOffset]);
      }
    }

    renderMatches(text.createDiv({ cls: "rm-suggest__name" }), file.name, nameMatches);

    if (file.parent !== null && file.parent.path !== "/") {
      text.createDiv({ cls: "rm-suggest__folder", text: file.parent.path });
    }
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}
