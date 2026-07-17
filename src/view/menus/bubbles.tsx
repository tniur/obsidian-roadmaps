import type { ReactNode } from "react";
import { TEXT_ALIGNS_H, TEXT_ALIGNS_V, DEFAULT_TEXT_ALIGN } from "../../domain/types";
import type { RoadmapCardNode, RoadmapClusterNode, RoadmapFlowEdge } from "../flow";
import { BubbleToolbar, MoreRow, type BubbleGroup } from "./BubbleToolbar";
import { ALIGN_H_ICONS, ALIGN_V_ICONS, PRIORITY_CHIPS, STATUS_CHIPS } from "./chipOptions";
import type { CanvasMenuActions } from "./menuActions";
import { ChipRow, ColorSwatchRow, CommitField, FlyoutSection, SegControl } from "./primitives";

const LINE_SEGS = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
] as const;

const SHAPE_SEGS = [
  { value: "curved", label: "Curved" },
  { value: "straight", label: "Straight" },
  { value: "step", label: "Angled" },
] as const;

const DIRECTION_SEGS = [
  { value: "none", label: "Undirected", icon: "minus" },
  { value: "forward", label: "Directed", icon: "arrow-right" },
  { value: "both", label: "Bidirectional", icon: "arrow-left-right" },
] as const;

const ANCHOR_SEGS = [
  { value: "floating", label: "Floating" },
  { value: "port", label: "Port" },
] as const;

interface BubbleProps {
  palette: readonly string[];
  actions: CanvasMenuActions;
}

export function NodeBubble({
  node,
  selectionIds,
  palette,
  actions,
}: BubbleProps & { node: RoadmapCardNode; selectionIds: readonly string[] }) {
  const id = node.id;
  const data = node.data;
  const align = data.align ?? DEFAULT_TEXT_ALIGN;
  const groupIds = selectionIds.includes(id) ? selectionIds : [id];
  const openLabel = data.kind === "url" ? "Open link" : data.kind === "image" ? "Open image" : "Open note";

  const contentFlyout = (): ReactNode => (
    <FlyoutSection label="Content">
      {data.kind === "text" ? (
        <CommitField
          label="Text"
          value={data.displayTitle}
          placeholder="Text"
          multiline
          onCommit={(value) => actions.setNodeText(id, value)}
        />
      ) : (
        <CommitField
          label="Title"
          value={data.customTitle ?? ""}
          placeholder={data.displayTitle}
          onCommit={(value) => actions.setNodeTitle(id, value)}
        />
      )}
      {data.kind === "url" ? (
        <CommitField
          label="URL"
          value={data.url ?? ""}
          placeholder="https://example.com"
          onCommit={(value) => actions.setNodeUrl(id, value)}
        />
      ) : null}
      <CommitField
        label="Description"
        value={data.description ?? ""}
        placeholder="Optional description"
        multiline
        onCommit={(value) => actions.setNodeDescription(id, value)}
      />
    </FlyoutSection>
  );

  const groups: BubbleGroup[] = [
    [{ id: "content", label: "Edit", icon: "pencil", flyout: contentFlyout, flyoutKind: "wide" }],
    [
      {
        id: "color",
        label: "Color",
        dot: { color: data.color },
        flyout: () => (
          <FlyoutSection label="Color">
            <ColorSwatchRow
              palette={palette}
              current={data.color}
              onPick={(color, options) => actions.setNodesMeta([id], { color }, options)}
            />
          </FlyoutSection>
        ),
      },
      {
        id: "align",
        label: "Alignment",
        icon: "align-left",
        flyout: () => (
          <FlyoutSection label="Alignment">
            <SegControl
              options={TEXT_ALIGNS_H.map((value) => ({ value, label: `Align ${value}`, icon: ALIGN_H_ICONS[value] }))}
              current={align.h}
              onPick={(h) => actions.setNodesAlign([id], { h })}
            />
            {data.kind === "image" ? null : (
              <SegControl
                options={TEXT_ALIGNS_V.map((value) => ({ value, label: `Align ${value}`, icon: ALIGN_V_ICONS[value] }))}
                current={align.v}
                onPick={(v) => actions.setNodesAlign([id], { v })}
              />
            )}
          </FlyoutSection>
        ),
      },
      {
        id: "priority",
        label: "Priority",
        icon: "flag",
        flyout: () => (
          <FlyoutSection label="Priority">
            <ChipRow
              options={PRIORITY_CHIPS}
              current={data.priority}
              caps
              onToggle={(priority) => actions.setNodesMeta([id], { priority })}
            />
          </FlyoutSection>
        ),
      },
      {
        id: "status",
        label: "Status",
        icon: "circle-check",
        flyout: () => (
          <FlyoutSection label="Status">
            <ChipRow
              options={STATUS_CHIPS}
              current={data.status}
              onToggle={(status) => actions.setNodesMeta([id], { status })}
            />
          </FlyoutSection>
        ),
      },
    ],
    [
      {
        id: "more",
        label: "More",
        icon: "ellipsis",
        flyoutKind: "tight",
        flyout: () => (
          <>
            {data.kind === "text" ? null : (
              <MoreRow icon="external-link" label={openLabel} onClick={() => actions.openNodeSource(id)} />
            )}
            <MoreRow icon="copy" label="Duplicate" onClick={() => actions.duplicateNodes([id])} />
            {node.parentId == null ? (
              <MoreRow icon="group" label="Group into cluster" onClick={() => actions.groupIntoCluster(groupIds)} />
            ) : null}
            <MoreRow icon="trash-2" label="Delete" danger onClick={() => actions.deleteNodes([id])} />
          </>
        ),
      },
    ],
  ];

  return <BubbleToolbar groups={groups} />;
}

export function EdgeBubble({ edge, palette, actions }: BubbleProps & { edge: RoadmapFlowEdge }) {
  const id = edge.id;
  const data = edge.data;

  if (data === undefined) {
    return null;
  }

  const anchorSeg = (end: "from" | "to", side: string | undefined): ReactNode => (
    <SegControl
      options={[...ANCHOR_SEGS]}
      current={side === undefined ? "floating" : "port"}
      onPick={(value) => actions.setEdgeAnchored(id, end, value === "port")}
    />
  );

  const groups: BubbleGroup[] = [
    [
      {
        id: "label",
        label: "Label",
        icon: "pencil",
        flyoutKind: "wide",
        flyout: () => (
          <FlyoutSection label="Label">
            <CommitField
              value={data.label ?? ""}
              placeholder="Optional label"
              onCommit={(value) => actions.updateEdge(id, { label: value })}
            />
          </FlyoutSection>
        ),
      },
    ],
    [
      {
        id: "color",
        label: "Color",
        dot: { color: data.color },
        flyout: () => (
          <FlyoutSection label="Color">
            <ColorSwatchRow
              palette={palette}
              current={data.color}
              onPick={(color, options) => actions.updateEdge(id, { color }, options)}
            />
          </FlyoutSection>
        ),
      },
      {
        id: "line",
        label: "Line",
        icon: "minus",
        flyout: () => (
          <>
            <FlyoutSection label="Line">
              <SegControl
                options={[...LINE_SEGS]}
                current={data.line ?? "solid"}
                onPick={(line) => actions.updateEdge(id, { line })}
              />
            </FlyoutSection>
            <FlyoutSection label="Shape">
              <SegControl
                options={[...SHAPE_SEGS]}
                current={data.shape ?? "curved"}
                onPick={(shape) => actions.updateEdge(id, { shape })}
              />
            </FlyoutSection>
          </>
        ),
      },
      {
        id: "direction",
        label: "Direction",
        icon: "arrow-right",
        flyout: () => (
          <FlyoutSection label="Direction">
            <SegControl
              options={[...DIRECTION_SEGS]}
              current={data.direction}
              onPick={(direction) => actions.updateEdge(id, { direction })}
            />
          </FlyoutSection>
        ),
      },
      {
        id: "anchor",
        label: "Anchors",
        icon: "spline",
        flyoutKind: "wide",
        flyout: () => (
          <>
            <FlyoutSection label="Source">{anchorSeg("from", data.fromSide)}</FlyoutSection>
            <FlyoutSection label="Target">{anchorSeg("to", data.toSide)}</FlyoutSection>
          </>
        ),
      },
    ],
    [
      {
        id: "more",
        label: "More",
        icon: "ellipsis",
        flyoutKind: "tight",
        flyout: () => (
          <>
            {data.direction === "forward" ? (
              <MoreRow icon="arrow-left-right" label="Reverse direction" onClick={() => actions.reverseEdge(id)} />
            ) : null}
            <MoreRow icon="trash-2" label="Delete" danger onClick={() => actions.deleteEdge(id)} />
          </>
        ),
      },
    ],
  ];

  return <BubbleToolbar groups={groups} />;
}

export function ClusterBubble({ cluster, palette, actions }: BubbleProps & { cluster: RoadmapClusterNode }) {
  const id = cluster.id;
  const data = cluster.data;

  const groups: BubbleGroup[] = [
    [
      {
        id: "content",
        label: "Rename",
        icon: "pencil",
        flyoutKind: "wide",
        flyout: () => (
          <FlyoutSection label="Name">
            <CommitField
              value={data.title}
              placeholder="Cluster name"
              onCommit={(value) => actions.renameCluster(id, value)}
            />
          </FlyoutSection>
        ),
      },
    ],
    [
      {
        id: "color",
        label: "Color",
        dot: { color: data.color },
        flyout: () => (
          <FlyoutSection label="Color">
            <ColorSwatchRow
              palette={palette}
              current={data.color}
              onPick={(color, options) => actions.setClusterColor(id, color, options)}
            />
          </FlyoutSection>
        ),
      },
      {
        id: "arrange",
        label: "Arrange nodes",
        icon: "layout-grid",
        disabled: data.collapsed,
        run: () => actions.arrangeCluster(id),
      },
      {
        id: "collapse",
        label: data.collapsed ? "Expand" : "Collapse",
        icon: data.collapsed ? "chevron-down" : "chevron-up",
        run: () => actions.toggleClusterCollapsed(id),
      },
    ],
    [
      {
        id: "more",
        label: "More",
        icon: "ellipsis",
        flyoutKind: "tight",
        flyout: () => (
          <>
            <MoreRow icon="ungroup" label="Ungroup" onClick={() => actions.ungroupCluster(id)} />
            <MoreRow icon="trash-2" label="Delete cluster" danger onClick={() => actions.deleteCluster(id)} />
          </>
        ),
      },
    ],
  ];

  return <BubbleToolbar groups={groups} />;
}
