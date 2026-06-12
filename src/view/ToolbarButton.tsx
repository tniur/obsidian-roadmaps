import { Icon } from "./Icon";

interface ToolbarButtonProps {
  icon: string;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function ToolbarButton({ icon, label, pressed, disabled, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className="rm-toolbar__button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      title={label}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}
