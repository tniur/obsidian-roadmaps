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

/** Footprint of a collapsed cluster and the header band of an expanded one; must stay
 * equal to the CSS token `--rm-cluster-header-height` in styles.css, which draws that band. */
export const COLLAPSED_CLUSTER_HEIGHT = 40;

/** Vertical gap between cluster content and the header band above / bottom edge below;
 * tighter than the horizontal padding, matching the gap between arranged nodes. */
export const CLUSTER_PADDING_Y = 16;

/** Top inset of cluster content: the header band plus the vertical content gap. */
export const CLUSTER_CONTENT_INSET_TOP = COLLAPSED_CLUSTER_HEIGHT + CLUSTER_PADDING_Y;

export const CLUSTER_NODE_GAP = 24;

export const EDGE_INTERACTION_WIDTH = 24;

export const BACKGROUND_DOT_GAP = 16;

/** Passed to the React Flow dot background; renders as a dot of half this size at zoom 1. */
export const BACKGROUND_DOT_SIZE = 1.6;
