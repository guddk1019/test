"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface EmployeeRow {
  ownerEmployeeId: string;
  owner: string;
  done: number;
  total: number;
}

interface EmployeePerformanceChartProps {
  rows: EmployeeRow[];
  activeOwnerEmployeeId?: string | null;
  onSelectOwner?: (ownerEmployeeId: string) => void;
}

type BarClickPayload = {
  payload?: {
    ownerEmployeeId?: string;
  };
};

function getOwnerEmployeeIdFromPayload(input: unknown): string | null {
  const payload = input as BarClickPayload;
  const value = payload?.payload?.ownerEmployeeId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function EmployeePerformanceChart({
  rows,
  activeOwnerEmployeeId,
  onSelectOwner,
}: EmployeePerformanceChartProps) {
  const chartRows = rows.map((row) => ({
    ...row,
    pendingOrOther: Math.max(row.total - row.done, 0),
    ownerShort: row.owner.length > 18 ? `${row.owner.slice(0, 18)}...` : row.owner,
    active: activeOwnerEmployeeId ? activeOwnerEmployeeId === row.ownerEmployeeId : true,
  }));

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-slate-800">직원별 처리량 상위</div>
      {rows.length === 0 ? (
        <div className="text-xs text-slate-500">데이터 없음</div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis dataKey="ownerShort" type="category" width={104} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value) => `${value ?? 0}`}
                labelFormatter={(label) => `담당자: ${label}`}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar
                dataKey="done"
                stackId="a"
                fill="#0891B2"
                name="승인"
                radius={[0, 4, 4, 0]}
                onClick={(payload) => {
                  const ownerEmployeeId = getOwnerEmployeeIdFromPayload(payload);
                  if (ownerEmployeeId) {
                    onSelectOwner?.(ownerEmployeeId);
                  }
                }}
                cursor={onSelectOwner ? "pointer" : "default"}
              >
                {chartRows.map((row) => (
                  <Cell
                    key={`${row.ownerEmployeeId}-done`}
                    fill="#0891B2"
                    opacity={!activeOwnerEmployeeId || row.active ? 1 : 0.25}
                  />
                ))}
              </Bar>
              <Bar
                dataKey="pendingOrOther"
                stackId="a"
                fill="#CBD5E1"
                name="기타"
                radius={[0, 4, 4, 0]}
                onClick={(payload) => {
                  const ownerEmployeeId = getOwnerEmployeeIdFromPayload(payload);
                  if (ownerEmployeeId) {
                    onSelectOwner?.(ownerEmployeeId);
                  }
                }}
                cursor={onSelectOwner ? "pointer" : "default"}
              >
                {chartRows.map((row) => (
                  <Cell
                    key={`${row.ownerEmployeeId}-other`}
                    fill="#CBD5E1"
                    opacity={!activeOwnerEmployeeId || row.active ? 1 : 0.2}
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
