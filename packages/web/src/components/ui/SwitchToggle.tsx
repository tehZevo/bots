import type { ReactNode } from "react";

export interface SwitchToggleProps {
  checked: boolean;
  stateLabel: string;
  onChange: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  labelledBy?: string;
  title?: ReactNode;
}

export function SwitchToggle({
  checked,
  stateLabel,
  onChange,
  disabled,
  ariaLabel,
  labelledBy,
  title,
}: SwitchToggleProps) {
  return (
    <label className="switch">
      {title}
      <input
        type="checkbox"
        {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
        {...(labelledBy ? { "aria-labelledby": labelledBy } : {})}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="knob" />
      <span className="state">{stateLabel}</span>
    </label>
  );
}
