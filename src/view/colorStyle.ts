import type { CSSProperties } from "react";

/**
 * Inline variable pair carrying an entity's custom color to its box and its connection
 * ports; `undefined` color yields no style so the token defaults stay in charge.
 */
export function colorStyleVars(
  varName: "--rm-node-color" | "--rm-cluster-color",
  color: string | undefined,
): CSSProperties | undefined {
  return color === undefined ? undefined : ({ [varName]: color, "--rm-port-color": color } as CSSProperties);
}
