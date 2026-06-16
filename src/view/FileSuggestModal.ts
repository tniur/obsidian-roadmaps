import { type App, FuzzySuggestModal, TFile } from "obsidian";

/** Fuzzy picker over a fixed set of vault files, reused for notes and image sources. */
export class FileSuggestModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private readonly files: TFile[],
    placeholder: string,
    private readonly onChoose: (file: TFile) => void,
  ) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}
