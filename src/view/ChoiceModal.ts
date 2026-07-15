import { setIcon, type App } from "obsidian";
import { addCancelButton, createModalFooter, RoadmapModal } from "./modalUi";

interface Choice {
  label: string;
  /** Explainer line rendered under the label. */
  detail?: string;
  warning?: boolean;
  onPick: () => void;
}

interface ChoiceOptions {
  title: string;
  /** Lucide icon shown as a danger-tinted tile before the title. */
  icon?: string;
  message?: string;
  choices: Choice[];
}

/** Confirmation dialog with a button per outcome; closing it (or Cancel) picks nothing. */
export class ChoiceModal extends RoadmapModal {
  constructor(
    app: App,
    private readonly options: ChoiceOptions,
  ) {
    super(app);
  }

  onOpen(): void {
    super.onOpen();

    if (this.options.icon !== undefined) {
      const tile = this.titleEl.createSpan({ cls: "rm-modal__title-icon" });

      setIcon(tile, this.options.icon);
    }

    this.titleEl.appendText(this.options.title);

    if (this.options.message !== undefined) {
      this.contentEl.createEl("p", { cls: "rm-modal__body", text: this.options.message });
    }

    const footer = createModalFooter(this.contentEl, true);

    for (const choice of this.options.choices) {
      const variant = choice.warning === true ? "rm-modal__btn--choice-danger" : "rm-modal__btn--choice";
      const button = footer.createEl("button", { cls: ["rm-modal__btn", variant] });

      button.createSpan({ text: choice.label });

      if (choice.detail !== undefined) {
        button.createSpan({ cls: "rm-modal__btn-sub", text: choice.detail });
      }

      button.addEventListener("click", () => {
        this.close();
        choice.onPick();
      });
    }

    addCancelButton(footer, () => this.close());
  }
}
