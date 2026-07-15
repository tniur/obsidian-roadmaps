import type { App } from "obsidian";
import { addCancelButton, addPrimaryButton, createModalFooter, RoadmapModal } from "./modalUi";

interface PromptOptions {
  title: string;
  placeholder?: string;
  initialValue?: string;
  cta?: string;
  onSubmit: (value: string) => void;
}

/** Single-line text prompt: input with an Enter hint, Cancel and a confirm button. */
export class PromptModal extends RoadmapModal {
  private value: string;

  constructor(
    app: App,
    private readonly options: PromptOptions,
  ) {
    super(app);
    this.value = options.initialValue ?? "";
  }

  onOpen(): void {
    super.onOpen();
    this.titleEl.setText(this.options.title);

    const cta = this.options.cta ?? "Save";
    const input = this.contentEl.createEl("input", {
      cls: "rm-modal__input",
      type: "text",
      placeholder: this.options.placeholder ?? "",
    });

    input.value = this.value;
    input.addEventListener("input", () => {
      this.value = input.value;
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        this.submit();
      }
    });

    const hint = this.contentEl.createDiv({ cls: "rm-modal__hint" });

    hint.appendText("Press ");
    hint.createEl("kbd", { cls: "rm-modal__kbd", text: "Enter" });
    hint.appendText(` to ${cta.toLowerCase()}`);

    const footer = createModalFooter(this.contentEl);

    addCancelButton(footer, () => this.close());
    addPrimaryButton(footer, cta, () => this.submit());
    input.focus();
    input.select();
  }

  private submit(): void {
    this.close();
    this.options.onSubmit(this.value.trim());
  }
}
