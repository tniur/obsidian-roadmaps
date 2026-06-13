import { type App, Modal, Setting } from "obsidian";

interface PromptOptions {
  title: string;
  placeholder?: string;
  initialValue?: string;
  cta?: string;
  onSubmit: (value: string) => void;
}

/** Single-line text prompt with a confirm button; submits on Enter or button click. */
export class PromptModal extends Modal {
  private value: string;

  constructor(
    app: App,
    private readonly options: PromptOptions,
  ) {
    super(app);
    this.value = options.initialValue ?? "";
  }

  onOpen(): void {
    this.titleEl.setText(this.options.title);
    new Setting(this.contentEl).addText((text) => {
      text
        .setPlaceholder(this.options.placeholder ?? "")
        .setValue(this.value)
        .onChange((value) => {
          this.value = value;
        });
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.submit();
        }
      });
      text.inputEl.focus();
      text.inputEl.select();
    });
    new Setting(this.contentEl).addButton((button) =>
      button
        .setButtonText(this.options.cta ?? "Save")
        .setCta()
        .onClick(() => this.submit()),
    );
  }

  private submit(): void {
    this.close();
    this.options.onSubmit(this.value.trim());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
