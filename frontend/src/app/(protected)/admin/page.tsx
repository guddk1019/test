"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAdminWorkItemDetail, getAdminWorkItems } from "@/lib/api/service";
import { WorkItemStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatDateTime, formatHours } from "@/lib/utils";
import { StatusDistributionChart } from "@/components/charts/status-distribution-chart";
import { EmployeePerformanceChart } from "@/components/charts/employee-performance-chart";
import {
  PROCESSING_BUCKET_LABELS,
  ProcessingBucketKey,
  ProcessingTimeBucketChart,
  getProcessingBucketKey,
} from "@/components/charts/processing-time-bucket-chart";

const STATUS_OPTIONS: Array<{ value: "" | WorkItemStatus; label: string }> = [
  { value: "", label: "All" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "EVALUATING", label: "Evaluating" },
  { value: "DONE", label: "Done" },
  { value: "REJECTED", label: "Rejected" },
  { value: "DRAFT", label: "Draft" },
];

type RangeFilter = "7d" | "30d" | "90d" | "all";

const RANGE_OPTIONS: Array<{ value: RangeFilter; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const EMPTY_STATUS_COUNTS: Record<WorkItemStatus, number> = {
  DRAFT: 0,
  SUBMITTED: 0,
  EVALUATING: 0,
  DONE: 0,
  REJECTED: 0,
};

function getRangeStartTimestamp(range: RangeFilter): number | null {
  if (range === "all") {
    return null;
  }
  const dayMap: Record<Exclude<RangeFilter, "all">, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
  };
  const days = dayMap[range];
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }
  return `${value.toFixed(1)}%`;
}

export default function AdminQueuePage() {
  const [status, setStatus] = useState<"" | WorkItemStatus>("SUBMITTED");
  const [department, setDepartment] = useState("");
  const [ownerEmployeeIdFilter, setOwnerEmployeeIdFilter] = useState("");
  const [processingBucketFilter, setProcessingBucketFilter] = useState<
    ProcessingBucketKey | ""
  >("");
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [range, setRange] = useState<RangeFilter>("30d");

  const listQuery = useQuery({
    queryKey: [
      "admin-work-items",
      status,
      keyword,
      department,
      ownerEmployeeIdFilter,
    ],
    queryFn: () =>
      getAdminWorkItems({
        status,
        q: keyword,
        department,
        ownerEmployeeId: ownerEmployeeIdFilter || undefined,
      }),
  });

  const rangeStart = useMemo(() => getRangeStartTimestamp(range), [range]);

  const rangeFilteredItems = useMemo(() => {
    const source = listQuery.data?.items ?? [];
    if (!rangeStart) {
      return source;
    }
    return source.filter((item) => {
      const updatedAt = new Date(item.updatedAt).getTime();
      return !Number.isNaN(updatedAt) && updatedAt >= rangeStart;
    });
  }, [listQuery.data?.items, rangeStart]);

  const ids = useMemo(() => rangeFilteredItems.map((item) => item.id), [rangeFilteredItems]);

  const metricsQuery = useQuery({
    queryKey: ["admin-kpi", ids.join(","), range],
    enabled: ids.length > 0,
    queryFn: async () => {
      const details = await Promise.all(ids.map((id) => getAdminWorkItemDetail(id)));
      const durations: number[] = [];
      const changeReviewDurations: number[] = [];
      const processingByWorkItemId: Record<number, number | null> = {};
      const changeRequestCounts = {
        total: 0,
        requested: 0,
        approved: 0,
        rejected: 0,
      };

      for (const detail of details) {
        let latestProcessed: { updatedAt: number; durationHours: number } | null = null;

        for (const submission of detail.submissions) {
          if (!submission.submittedAt) {
            continue;
          }
          if (!["DONE", "REJECTED"].includes(submission.status)) {
            continue;
          }

          const submittedAt = new Date(submission.submittedAt).getTime();
          const updatedAt = new Date(submission.updatedAt).getTime();
          if (Number.isNaN(submittedAt) || Number.isNaN(updatedAt) || updatedAt < submittedAt) {
            continue;
          }
          if (rangeStart && updatedAt < rangeStart) {
            continue;
          }

          const durationHours = (updatedAt - submittedAt) / 1000 / 60 / 60;
          durations.push(durationHours);
          if (!latestProcessed || updatedAt > latestProcessed.updatedAt) {
            latestProcessed = { updatedAt, durationHours };
          }
        }

        processingByWorkItemId[detail.workItem.id] = latestProcessed
          ? latestProcessed.durationHours
          : null;

        for (const changeRequest of detail.changeRequests ?? []) {
          const createdAt = new Date(changeRequest.createdAt).getTime();
          if (Number.isNaN(createdAt)) {
            continue;
          }
          if (rangeStart && createdAt < rangeStart) {
            continue;
          }

          changeRequestCounts.total += 1;
          if (changeRequest.status === "REQUESTED") {
            changeRequestCounts.requested += 1;
          } else if (changeRequest.status === "APPROVED") {
            changeRequestCounts.approved += 1;
          } else if (changeRequest.status === "REJECTED") {
            changeRequestCounts.rejected += 1;
          }

          if (!["APPROVED", "REJECTED"].includes(changeRequest.status)) {
            continue;
          }
          const reviewedAt = new Date(changeRequest.reviewedAt ?? "").getTime();
          if (Number.isNaN(reviewedAt) || reviewedAt < createdAt) {
            continue;
          }
          const reviewHours = (reviewedAt - createdAt) / 1000 / 60 / 60;
          changeReviewDurations.push(reviewHours);
        }
      }

      const avg =
        durations.length > 0
          ? durations.reduce((acc, value) => acc + value, 0) / durations.length
          : null;
      const avgChangeReview =
        changeReviewDurations.length > 0
          ? changeReviewDurations.reduce((acc, value) => acc + value, 0) /
            changeReviewDurations.length
          : null;
      const approvalRate =
        changeRequestCounts.total > 0
          ? (changeRequestCounts.approved / changeRequestCounts.total) * 100
          : null;

      return {
        durations,
        averageProcessingHours: avg,
        processingByWorkItemId,
        changeRequestCounts,
        averageChangeReviewHours: avgChangeReview,
        changeRequestApprovalRate: approvalRate,
      };
    },
  });

  const filteredItems = useMemo(() => {
    if (!processingBucketFilter) {
      return rangeFilteredItems;
    }
    if (!metricsQuery.data) {
      return rangeFilteredItems;
    }
    return rangeFilteredItems.filter((item) => {
      const hours = metricsQuery.data.processingByWorkItemId[item.id];
      const bucket = getProcessingBucketKey(hours);
      return bucket === processingBucketFilter;
    });
  }, [metricsQuery.data, processingBucketFilter, rangeFilteredItems]);

  const employeeKpi = useMemo(() => {
    const map = new Map<
      string,
      { ownerEmployeeId: string; owner: string; done: number; total: number }
    >();
    for (const item of filteredItems) {
      const key = `${item.ownerEmployeeId}:${item.ownerName}`;
      const current = map.get(key) ?? {
        ownerEmployeeId: item.ownerEmployeeId,
        owner: `${item.ownerName} (${item.ownerEmployeeId})`,
        done: 0,
        total: 0,
      };
      current.total += 1;
      if (item.status === "DONE") {
        current.done += 1;
      }
      map.set(key, current);
    }
    return Array.from(map.values())
      .sort((a, b) => b.done - a.done || b.total - a.total)
      .slice(0, 6);
  }, [filteredItems]);

  const counts = useMemo(() => {
    return {
      approved: filteredItems.filter((item) => item.status === "DONE").length,
      rejected: filteredItems.filter((item) => item.status === "REJECTED").length,
      pending: filteredItems.filter((item) =>
        ["SUBMITTED", "EVALUATING"].includes(item.status),
      ).length,
    };
  }, [filteredItems]);

  const statusCounts = useMemo(() => {
    const snapshot = { ...EMPTY_STATUS_COUNTS };
    for (const item of filteredItems) {
      snapshot[item.status] += 1;
    }
    return snapshot;
  }, [filteredItems]);

  const selectedOwnerLabel = useMemo(() => {
    if (!ownerEmployeeIdFilter) {
      return null;
    }
    const found = listQuery.data?.items.find(
      (item) => item.ownerEmployeeId === ownerEmployeeIdFilter,
    );
    if (!found) {
      return ownerEmployeeIdFilter;
    }
    return `${found.ownerName} (${found.ownerEmployeeId})`;
  }, [listQuery.data?.items, ownerEmployeeIdFilter]);

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-xl font-bold text-slate-900">Admin Submission Queue</h1>
        <p className="mt-1 text-sm text-slate-500">
          Interactive KPIs and drill-down filters by chart click.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Approved</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{counts.approved}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Pending</div>
          <div className="mt-2 text-2xl font-bold text-blue-700">{counts.pending}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Rejected</div>
          <div className="mt-2 text-2xl font-bold text-rose-700">{counts.rejected}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Avg. Processing Time</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {formatHours(metricsQuery.data?.averageProcessingHours ?? null)}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Change Requests</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {metricsQuery.data?.changeRequestCounts.total ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Requested</div>
          <div className="mt-2 text-2xl font-bold text-amber-700">
            {metricsQuery.data?.changeRequestCounts.requested ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Approved</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">
            {metricsQuery.data?.changeRequestCounts.approved ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Rejected</div>
          <div className="mt-2 text-2xl font-bold text-rose-700">
            {metricsQuery.data?.changeRequestCounts.rejected ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Approval Rate / Avg Review</div>
          <div className="mt-2 text-xl font-bold text-slate-900">
            {formatPercent(metricsQuery.data?.changeRequestApprovalRate ?? null)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {formatHours(metricsQuery.data?.averageChangeReviewHours ?? null)}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-[170px_170px_1fr_170px_auto]">
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
            <select
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
              value={range}
              onChange={(event) => setRange(event.target.value as RangeFilter)}
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              placeholder="Department"
            />
            <input
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search title/plan text"
            />
            <Button
              variant="secondary"
              onClick={() => setKeyword(searchInput.trim())}
              type="button"
            >
              Search
            </Button>
          </div>

          {status || ownerEmployeeIdFilter || processingBucketFilter ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {status ? (
                <button
                  className="rounded-full bg-cyan-50 px-3 py-1 font-medium text-cyan-800"
                  onClick={() => setStatus("")}
                  type="button"
                >
                  Status: {status} x
                </button>
              ) : null}
              {ownerEmployeeIdFilter ? (
                <button
                  className="rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-800"
                  onClick={() => setOwnerEmployeeIdFilter("")}
                  type="button"
                >
                  Owner: {selectedOwnerLabel} x
                </button>
              ) : null}
              {processingBucketFilter ? (
                <button
                  className="rounded-full bg-violet-50 px-3 py-1 font-medium text-violet-800"
                  onClick={() => setProcessingBucketFilter("")}
                  type="button"
                >
                  Processing: {PROCESSING_BUCKET_LABELS[processingBucketFilter]} x
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            {listQuery.isLoading ? (
              <div className="py-6 text-sm text-slate-500">Loading queue...</div>
            ) : listQuery.isError ? (
              <div className="py-6 text-sm font-medium text-rose-700">
                {listQuery.error.message}
              </div>
            ) : (
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Work Item</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((item) => (
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
                        <div className="text-xs text-slate-500">{item.ownerEmployeeId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-3">{formatDate(item.dueDate)}</td>
                      <td className="px-4 py-3">{formatDateTime(item.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {!listQuery.isLoading && filteredItems.length === 0 ? (
            <div className="text-sm text-slate-500">No items in selected filter set.</div>
          ) : null}
        </div>

        <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <StatusDistributionChart
            counts={statusCounts}
            activeStatus={status || null}
            onSelectStatus={(selected) =>
              setStatus((previous) => (previous === selected ? "" : selected))
            }
          />
          <div className="h-px bg-slate-200" />
          <ProcessingTimeBucketChart
            durations={metricsQuery.data?.durations ?? []}
            activeBucket={processingBucketFilter || null}
            onSelectBucket={(selected) =>
              setProcessingBucketFilter((previous) =>
                previous === selected ? "" : selected,
              )
            }
          />
          <div className="h-px bg-slate-200" />
          <EmployeePerformanceChart
            rows={employeeKpi}
            activeOwnerEmployeeId={ownerEmployeeIdFilter || null}
            onSelectOwner={(ownerEmployeeId) =>
              setOwnerEmployeeIdFilter((previous) =>
                previous === ownerEmployeeId ? "" : ownerEmployeeId,
              )
            }
          />
        </aside>
      </div>
    </section>
  );
}
