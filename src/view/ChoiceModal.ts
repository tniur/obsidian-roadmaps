import { Modal, Setting, type App } from "obsidian";

interface Choice {
  label: string;
  warning?: boolean;
  onPick: () => void;
}

interface ChoiceOptions {
  title: string;
  message?: string;
  choices: Choice[];
}

/** Confirmation dialog with a button per outcome; closing it (or Cancel) picks nothing. */
export class ChoiceModal extends Modal {
  constructor(
    app: App,
    private readonly options: ChoiceOptions,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.options.title);

    if (this.options.message !== undefined) {
      this.contentEl.createEl("p", { text: this.options.message });
    }

    const buttons = new Setting(this.contentEl);

    for (const choice of this.options.choices) {
      buttons.addButton((button) => {
        button.setButtonText(choice.label).onClick(() => {
          this.close();
          choice.onPick();
        });

        if (choice.warning === true) {
          button.setWarning();
        }
      });
    }

    buttons.addButton((button) =>
      button.setButtonText("Cancel").onClick(() => {
        this.close();
      }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
