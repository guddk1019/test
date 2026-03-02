"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmployeePerformanceChart } from "@/components/charts/employee-performance-chart";
import {
  ProcessingBucketKey,
  ProcessingTimeBucketChart,
} from "@/components/charts/processing-time-bucket-chart";
import { StatusDistributionChart } from "@/components/charts/status-distribution-chart";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getAdminDashboard,
  getAdminWorkItems,
} from "@/lib/api/service";
import { WORK_ITEM_STATUS_LABEL } from "@/lib/status-labels";
import { WorkItemStatus } from "@/lib/types";
import { formatDate, formatDateTime, formatHours } from "@/lib/utils";

const STATUS_OPTIONS: Array<{ value: "" | WorkItemStatus; label: string }> = [
  { value: "", label: "전체" },
  { value: "SUBMITTED", label: WORK_ITEM_STATUS_LABEL.SUBMITTED },
  { value: "EVALUATING", label: WORK_ITEM_STATUS_LABEL.EVALUATING },
  { value: "DONE", label: WORK_ITEM_STATUS_LABEL.DONE },
  { value: "REJECTED", label: WORK_ITEM_STATUS_LABEL.REJECTED },
  { value: "DRAFT", label: WORK_ITEM_STATUS_LABEL.DRAFT },
];

function toIsoDate(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function toCsvValue(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export default function AdminQueuePage() {
  const [status, setStatus] = useState<"" | WorkItemStatus>("SUBMITTED");
  const [departmentInput, setDepartmentInput] = useState("");
  const [department, setDepartment] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [fromDate, setFromDate] = useState(() => toIsoDate(-30));
  const [toDate, setToDate] = useState(() => toIsoDate(0));
  const [activeStatus, setActiveStatus] = useState<WorkItemStatus | null>(null);
  const [activeOwnerEmployeeId, setActiveOwnerEmployeeId] = useState<string | null>(null);
  const [activeBucket, setActiveBucket] = useState<ProcessingBucketKey | null>(null);

  const listQuery = useQuery({
    queryKey: ["admin-work-items", status, department, keyword],
    queryFn: () =>
      getAdminWorkItems({
        status: status || undefined,
        department: department || undefined,
        q: keyword || undefined,
      }),
  });

  const dashboardQuery = useQuery({
    queryKey: ["admin-dashboard", fromDate, toDate, department],
    queryFn: () =>
      getAdminDashboard({
        fromDate,
        toDate,
        department: department || undefined,
      }),
  });

  const listItems = listQuery.data?.items ?? [];
  const dashboard = dashboardQuery.data;

  const workItemLikeStatusCounts = useMemo(
    () => ({
      DRAFT: dashboard?.summary.uploadingCount ?? 0,
      SUBMITTED: dashboard?.statusDistribution.SUBMITTED ?? 0,
      EVALUATING: dashboard?.statusDistribution.EVALUATING ?? 0,
      DONE: dashboard?.statusDistribution.DONE ?? 0,
      REJECTED: dashboard?.statusDistribution.REJECTED ?? 0,
    }),
    [dashboard],
  );

  const counts = useMemo(() => {
    return {
      total: listItems.length,
      submitted: listItems.filter((item) => item.status === "SUBMITTED").length,
      evaluating: listItems.filter((item) => item.status === "EVALUATING").length,
      done: listItems.filter((item) => item.status === "DONE").length,
      rejected: listItems.filter((item) => item.status === "REJECTED").length,
    };
  }, [listItems]);

  const exportCsv = () => {
    const rows = dashboard?.submissions ?? [];
    if (rows.length === 0) {
      return;
    }

    const header = [
      "submission_id",
      "version",
      "status",
      "submitted_at",
      "updated_at",
      "processing_hours",
      "work_item_id",
      "work_item_title",
      "owner_employee_id",
      "owner_name",
      "owner_department",
    ];

    const body = rows.map((row) =>
      [
        row.submissionId,
        row.submissionVersion,
        row.submissionStatus,
        row.submittedAt,
        row.updatedAt,
        row.processingHours,
        row.workItemId,
        row.workItemTitle,
        row.ownerEmployeeId,
        row.ownerName,
        row.ownerDepartment,
      ]
        .map((value) => toCsvValue(value))
        .join(","),
    );

    const csv = `${header.join(",")}\n${body.join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const blobUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `admin-dashboard-${fromDate}-${toDate}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-xl font-bold text-slate-900">관리자 제출 큐</h1>
        <p className="mt-1 text-sm text-slate-500">
          제출 승인, 처리 시간, 직원 성과를 한 번에 조회할 수 있습니다.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">전체</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{counts.total}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">제출됨</div>
          <div className="mt-2 text-2xl font-bold text-cyan-700">{counts.submitted}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">평가중</div>
          <div className="mt-2 text-2xl font-bold text-indigo-700">{counts.evaluating}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">승인</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{counts.done}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">반려</div>
          <div className="mt-2 text-2xl font-bold text-rose-700">{counts.rejected}</div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-[170px_170px_1fr_auto]">
          <select
            className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as "" | WorkItemStatus)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <input
            className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            value={departmentInput}
            onChange={(event) => setDepartmentInput(event.target.value)}
            placeholder="부서"
          />

          <input
            className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            data-testid="admin-workitems-search-input"
            placeholder="업무명/계획 검색"
          />

          <Button
            variant="secondary"
            onClick={() => {
              setDepartment(departmentInput.trim());
              setKeyword(searchInput.trim());
            }}
            type="button"
            data-testid="admin-workitems-search-button"
          >
            검색
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
          <input
            className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
          <Button
            variant="secondary"
            onClick={exportCsv}
            disabled={(dashboard?.submissions.length ?? 0) === 0}
            type="button"
          >
            CSV 내보내기
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">승인 수</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">
            {dashboard?.summary.approvedCount ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">반려 수</div>
          <div className="mt-2 text-2xl font-bold text-rose-700">
            {dashboard?.summary.rejectedCount ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">평균 처리시간</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {formatHours(dashboard?.summary.avgProcessingHours ?? null)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">중앙 처리시간</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {formatHours(dashboard?.summary.medianProcessingHours ?? null)}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <StatusDistributionChart
            counts={workItemLikeStatusCounts}
            activeStatus={activeStatus}
            onSelectStatus={(nextStatus) => {
              setActiveStatus((prev) => (prev === nextStatus ? null : nextStatus));
              setStatus(nextStatus);
            }}
          />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <EmployeePerformanceChart
            rows={(dashboard?.employeePerformance ?? []).map((row) => ({
              ownerEmployeeId: row.ownerEmployeeId,
              owner: `${row.ownerName} (${row.ownerDepartment})`,
              done: row.done,
              total: row.total,
            }))}
            activeOwnerEmployeeId={activeOwnerEmployeeId}
            onSelectOwner={(ownerEmployeeId) =>
              setActiveOwnerEmployeeId((prev) =>
                prev === ownerEmployeeId ? null : ownerEmployeeId,
              )
            }
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <ProcessingTimeBucketChart
          durations={dashboard?.processingHours ?? []}
          activeBucket={activeBucket}
          onSelectBucket={(bucket) =>
            setActiveBucket((prev) => (prev === bucket ? null : bucket))
          }
        />
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="overflow-x-auto">
          {listQuery.isLoading ? (
            <div className="py-6 text-sm text-slate-500">제출 목록을 불러오는 중입니다.</div>
          ) : listQuery.isError ? (
            <div className="py-6 text-sm font-medium text-rose-700">{listQuery.error.message}</div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">업무명</th>
                  <th className="px-4 py-3">담당자</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">기한</th>
                  <th className="px-4 py-3">최신 제출</th>
                  <th className="px-4 py-3">업데이트</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/work-items/${item.id}`}
                        className="font-semibold text-cyan-800 hover:underline"
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.ownerName}
                      <div className="text-xs text-slate-500">
                        {item.ownerEmployeeId} / {item.ownerDepartment}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3">{formatDate(item.dueDate)}</td>
                    <td className="px-4 py-3">
                      v{String(item.latestSubmissionVersion).padStart(3, "0")}
                    </td>
                    <td className="px-4 py-3">{formatDateTime(item.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!listQuery.isLoading && listItems.length === 0 ? (
          <div className="text-sm text-slate-500">현재 조건에 맞는 업무가 없습니다.</div>
        ) : null}
      </div>
    </section>
  );
}
