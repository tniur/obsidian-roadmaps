import { Panel } from "@xyflow/react";
import { type CSSProperties } from "react";
import { PROGRESS_BUCKETS, type BoardProgress, type ProgressBucket } from "../domain/progress";
import { humanizeValue } from "../domain/title";
import { Icon } from "./Icon";

function bucketColor(bucket: ProgressBucket): string {
  return bucket === "none" ? "var(--rm-status-none)" : `var(--rm-status-${bucket})`;
}

function bucketLabel(bucket: ProgressBucket): string {
  return bucket === "none" ? "No status" : humanizeValue(bucket);
}

function bucketStyle(progress: BoardProgress, bucket: ProgressBucket): CSSProperties {
  return { "--rm-progress-color": bucketColor(bucket), "--rm-progress-grow": progress.counts[bucket] } as CSSProperties;
}

interface ProgressIslandProps {
  progress: BoardProgress;
  inCorner: boolean;
  compact: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}

/**
 * Passive island summarising board completion, pinned to the top centre or the top-right corner.
 * Compact shows only the status-segmented bar; otherwise the done share sits above it and can
 * expand into a per-status legend. Visibility is a board setting; an empty board renders nothing.
 */
export function ProgressIsland({ progress, inCorner, compact, expanded, onToggleExpanded }: ProgressIslandProps) {
  if (progress.total === 0) {
    return null;
  }

  const buckets = PROGRESS_BUCKETS.filter((bucket) => progress.counts[bucket] > 0);

  return (
    <Panel
      position={inCorner ? "top-right" : "top-center"}
      className={compact ? "rm-panel rm-progress rm-progress--compact" : "rm-panel rm-progress"}
    >
      {compact ? null : (
        <div className="rm-progress__head">
          <span className="rm-progress__percent">{progress.donePercent}%</span>
          <span className="rm-progress__fraction">
            {progress.done} / {progress.total} done
          </span>
          <button
            type="button"
            className="rm-progress__toggle"
            aria-label={expanded ? "Hide details" : "Show details"}
            aria-expanded={expanded}
            title={expanded ? "Hide details" : "Show details"}
            onClick={onToggleExpanded}
          >
            <Icon name={expanded ? "chevron-up" : "chevron-down"} />
          </button>
        </div>
      )}
      <div className="rm-progress__bar">
        {buckets.map((bucket) => (
          <span key={bucket} className="rm-progress__segment" style={bucketStyle(progress, bucket)} />
        ))}
      </div>
      {!compact && expanded ? (
        <div className="rm-progress__legend">
          {buckets.map((bucket) => (
            <span key={bucket} className="rm-progress__stat" style={bucketStyle(progress, bucket)}>
              <span className="rm-progress__dot" />
              <span className="rm-progress__count">{progress.counts[bucket]}</span>
              <span className="rm-progress__name">{bucketLabel(bucket)}</span>
            </span>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
