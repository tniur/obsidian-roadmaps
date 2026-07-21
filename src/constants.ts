export const VIEW_TYPE_ROADMAP = "roadmap-view";

export const ROADMAP_FRONTMATTER_KEY = "roadmap-plugin";

export const ROADMAP_FRONTMATTER_VALUE = "board";

export const ROADMAP_SCHEMA_VERSION = 1;

export const BACKGROUND_DOTS_ICON_ID = "roadmap-background-dots";

export const STATUS_IN_PROGRESS_ICON_ID = "roadmap-status-in-progress";

export const DEFAULT_NODE_WIDTH = 200;

export const DEFAULT_NODE_HEIGHT = 80;

export const MIN_NODE_WIDTH = 140;

export const MIN_NODE_HEIGHT = 56;

export const DEFAULT_CLUSTER_WIDTH = 400;

export const DEFAULT_CLUSTER_HEIGHT = 300;

export const CLUSTER_PADDING = 24;

export const MIN_CLUSTER_WIDTH = 160;

export const MIN_CLUSTER_HEIGHT = 120;

/** Footprint of a collapsed cluster and the header band of an expanded one; must stay equal
 * to the CSS token `--rm-cluster-header-height` in styles/tokens.css, which draws that band. */
export const COLLAPSED_CLUSTER_HEIGHT = 40;

/** Vertical gap between cluster content and the header band above / bottom edge below;
 * tighter than the horizontal padding, matching the gap between arranged nodes. */
export const CLUSTER_PADDING_Y = 16;

export const CLUSTER_CONTENT_INSET_TOP = COLLAPSED_CLUSTER_HEIGHT + CLUSTER_PADDING_Y;

export const CLUSTER_NODE_GAP = 24;

export const EDGE_INTERACTION_WIDTH = 24;

/** Lower zoom bound; well below the React Flow default of 0.5 so large boards can be
 * zoomed out and framed by fit-view without clipping. */
export const MIN_ZOOM = 0.15;

export const MAX_ZOOM = 2;

/** Fraction of the viewport kept as breathing room around content when framing the camera. */
export const FIT_VIEW_PADDING = 0.15;

export const BACKGROUND_DOT_GAP = 16;

/** Passed to the React Flow dot background; renders as a dot of half this size at zoom 1. */
export const BACKGROUND_DOT_SIZE = 1.6;

/** Must stay equal to the CSS token `--rm-preview-width` in styles/tokens.css. */
export const PREVIEW_DEFAULT_WIDTH = 440;

export const PREVIEW_MIN_WIDTH = 320;

export const PREVIEW_MAX_WIDTH = 760;

export function clampPreviewWidth(value: number): number {
  if (!Number.isFinite(value)) {
    return PREVIEW_DEFAULT_WIDTH;
  }

  return Math.min(PREVIEW_MAX_WIDTH, Math.max(PREVIEW_MIN_WIDTH, Math.round(value)));
}
