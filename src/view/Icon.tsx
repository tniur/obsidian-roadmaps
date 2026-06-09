import { setIcon } from "obsidian";
import { useEffect, useRef } from "react";

interface IconProps {
  name: string;
}

export function Icon({ name }: IconProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el !== null) {
      setIcon(el, name);
    }
  }, [name]);

  return <span ref={ref} className="rm-icon" aria-hidden="true" />;
}
