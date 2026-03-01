"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAdminChangeRequests } from "@/lib/api/service";
import { Button } from "@/components/ui/button";
import { ChangeRequestStatus } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/utils";

type RangeFilter = "7d" | "30d" | "90d" | "all";

const RANGE_OPTIONS: Array<{ value: RangeFilter; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

const STATUS_OPTIONS: Array<{ value: "" | ChangeRequestStatus; label: string }> = [
  { value: "", label: "All" },
  { value: "REQUESTED", label: "Requested" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

function rangeToFromDate(range: RangeFilter): string | undefined {
  if (range === "all") {
    return undefined;
  }
  const daysMap: Record<Exclude<RangeFilter, "all">, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
  };
  const date = new Date();
  date.setDate(date.getDate() - daysMap[range]);
  return date.toISOString().slice(0, 10);
}

function statusClass(status: ChangeRequestStatus): string {
  if (status === "APPROVED") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (status === "REJECTED") {
    return "bg-rose-100 text-rose-800";
  }
  return "bg-amber-100 text-amber-800";
}

export default function AdminChangeRequestsPage() {
  const [status, setStatus] = useState<"" | ChangeRequestStatus>("");
  const [requesterEmployeeIdInput, setRequesterEmployeeIdInput] = useState("");
  const [requesterEmployeeId, setRequesterEmployeeId] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [range, setRange] = useState<RangeFilter>("30d");

  const fromDate = useMemo(() => rangeToFromDate(range), [range]);

  const query = useQuery({
    queryKey: [
      "admin-change-requests",
      status,
      requesterEmployeeId,
      keyword,
      fromDate,
    ],
    queryFn: () =>
      getAdminChangeRequests({
        status: status || undefined,
        requesterEmployeeId: requesterEmployeeId || undefined,
        q: keyword || undefined,
        fromDate,
      }),
  });

  const counts = useMemo(() => {
    const source = query.data?.items ?? [];
    return {
      total: source.length,
      requested: source.filter((item) => item.status === "REQUESTED").length,
      approved: source.filter((item) => item.status === "APPROVED").length,
      rejected: source.filter((item) => item.status === "REJECTED").length,
    };
  }, [query.data?.items]);

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-xl font-bold text-slate-900">Change Requests</h1>
        <p className="mt-1 text-sm text-slate-500">
          Filter and search by status, requester, and period.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Total</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{counts.total}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Requested</div>
          <div className="mt-2 text-2xl font-bold text-amber-700">{counts.requested}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Approved</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{counts.approved}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Rejected</div>
          <div className="mt-2 text-2xl font-bold text-rose-700">{counts.rejected}</div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-[160px_160px_1fr_1fr_auto]">
          <select
            className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "" | ChangeRequestStatus)
            }
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
            value={requesterEmployeeIdInput}
            onChange={(event) => setRequesterEmployeeIdInput(event.target.value)}
            placeholder="Requester employee ID"
          />
          <input
            className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search work item title / reason"
          />
          <Button
            variant="secondary"
            onClick={() => {
              setRequesterEmployeeId(requesterEmployeeIdInput.trim());
              setKeyword(searchInput.trim());
            }}
            type="button"
          >
            Search
          </Button>
        </div>

        <div className="overflow-x-auto">
          {query.isLoading ? (
            <div className="py-6 text-sm text-slate-500">Loading change requests...</div>
          ) : query.isError ? (
            <div className="py-6 text-sm font-medium text-rose-700">
              {query.error.message}
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Version</th>
                  <th className="px-4 py-3">Work Item</th>
                  <th className="px-4 py-3">Requester</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Proposed Due</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Reviewed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(query.data?.items ?? []).map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      v{String(item.version).padStart(3, "0")}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/work-items/${item.workItemId}`}
                        className="font-semibold text-cyan-800 hover:underline"
                      >
                        {item.workItemTitle}
                      </Link>
                      <div className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {item.changeText}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.requesterName}
                      <div className="text-xs text-slate-500">{item.requesterEmployeeId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatDate(item.proposedDueDate)}</td>
                    <td className="px-4 py-3">{formatDateTime(item.createdAt)}</td>
                    <td className="px-4 py-3">{formatDateTime(item.reviewedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!query.isLoading && (query.data?.items.length ?? 0) === 0 ? (
          <div className="text-sm text-slate-500">No change requests in current filter.</div>
        ) : null}
      </div>
    </section>
  );
}
