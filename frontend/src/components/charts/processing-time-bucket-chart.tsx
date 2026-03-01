"use client";

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ProcessingTimeBucketChartProps {
  durations: number[];
  activeBucket?: ProcessingBucketKey | null;
  onSelectBucket?: (bucket: ProcessingBucketKey) => void;
}

type Bucket = {
  key: ProcessingBucketKey;
  label: string;
  min: number;
  max: number | null;
};

export type ProcessingBucketKey = "lt1" | "h1to4" | "h4to24" | "gte24";

export const PROCESSING_BUCKET_LABELS: Record<ProcessingBucketKey, string> = {
  lt1: "< 1h",
  h1to4: "1h - 4h",
  h4to24: "4h - 24h",
  gte24: ">= 24h",
};

const BUCKETS: Bucket[] = [
  { key: "lt1", label: PROCESSING_BUCKET_LABELS.lt1, min: 0, max: 1 },
  { key: "h1to4", label: PROCESSING_BUCKET_LABELS.h1to4, min: 1, max: 4 },
  { key: "h4to24", label: PROCESSING_BUCKET_LABELS.h4to24, min: 4, max: 24 },
  { key: "gte24", label: PROCESSING_BUCKET_LABELS.gte24, min: 24, max: null },
];

export function getProcessingBucketKey(
  durationHours: number | null | undefined,
): ProcessingBucketKey | null {
  if (durationHours === null || durationHours === undefined || Number.isNaN(durationHours)) {
    return null;
  }
  if (durationHours < 1) {
    return "lt1";
  }
  if (durationHours < 4) {
    return "h1to4";
  }
  if (durationHours < 24) {
    return "h4to24";
  }
  return "gte24";
}

export function ProcessingTimeBucketChart({
  durations,
  activeBucket,
  onSelectBucket,
}: ProcessingTimeBucketChartProps) {
  const rows = BUCKETS.map((bucket) => {
    const count = durations.filter((value) => {
      if (bucket.max === null) {
        return value >= bucket.min;
      }
      return value >= bucket.min && value < bucket.max;
    }).length;
    return {
      key: bucket.key,
      label: bucket.label,
      count,
    };
  });

  const total = rows.reduce((acc, row) => acc + row.count, 0);

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-slate-800">Processing Time Buckets</div>
      {total === 0 ? (
        <div className="text-xs text-slate-500">No processed submissions yet</div>
      ) : (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#7C3AED" radius={[4, 4, 0, 0]}>
                {rows.map((row) => (
                  <Cell
                    key={row.key}
                    cursor={onSelectBucket ? "pointer" : "default"}
                    fill="#7C3AED"
                    opacity={activeBucket && activeBucket !== row.key ? 0.25 : 1}
                    onClick={() => onSelectBucket?.(row.key)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
