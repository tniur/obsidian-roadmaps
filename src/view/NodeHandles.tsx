import { Handle, Position } from "@xyflow/react";

const HANDLE_SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

/** The four floating connection anchors shared by node cards and cluster containers. */
export function NodeHandles({ isConnectable }: { isConnectable?: boolean }) {
  return (
    <>
      {HANDLE_SIDES.map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={side}
          className="rm-handle"
          isConnectable={isConnectable}
        />
      ))}
    </>
  );
}
