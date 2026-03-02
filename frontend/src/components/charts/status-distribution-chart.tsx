"use client";

import { WorkItemStatus } from "@/lib/types";
import { WORK_ITEM_STATUS_LABEL } from "@/lib/status-labels";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface StatusDistributionChartProps {
  counts: Record<WorkItemStatus, number>;
  activeStatus?: WorkItemStatus | null;
  onSelectStatus?: (status: WorkItemStatus) => void;
}

const STATUS_COLOR: Record<WorkItemStatus, string> = {
  DRAFT: "#94A3B8",
  SUBMITTED: "#3B82F6",
  EVALUATING: "#F59E0B",
  DONE: "#10B981",
  REJECTED: "#F43F5E",
};

export function StatusDistributionChart({
  counts,
  activeStatus,
  onSelectStatus,
}: StatusDistributionChartProps) {
  const rows = (Object.keys(counts) as WorkItemStatus[]).map((status) => ({
    status,
    name: WORK_ITEM_STATUS_LABEL[status],
    value: counts[status],
    color: STATUS_COLOR[status],
  }));

  const total = rows.reduce((acc, row) => acc + row.value, 0);

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-slate-800">상태 분포</div>
      {total === 0 ? (
        <div className="text-xs text-slate-500">데이터 없음</div>
      ) : (
        <>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={76}
                  paddingAngle={3}
                  onClick={(entry) => onSelectStatus?.(entry.status)}
                >
                  {rows.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={entry.color}
                      cursor={onSelectStatus ? "pointer" : "default"}
                      opacity={
                        activeStatus && activeStatus !== entry.status ? 0.28 : 1
                      }
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-1">
            {rows.map((row) => {
              const pct = total > 0 ? Math.round((row.value / total) * 100) : 0;
              return (
                <li key={row.name} className="flex items-center justify-between text-xs text-slate-600">
                  <button
                    className="flex items-center gap-2"
                    onClick={() => onSelectStatus?.(row.status)}
                    type="button"
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    {row.name}
                  </button>
                  <span>
                    {row.value} ({pct}%)
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
