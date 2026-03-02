"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAdminWorkItems } from "@/lib/api/service";
import { WorkItemStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate, formatDateTime } from "@/lib/utils";
import { WORK_ITEM_STATUS_LABEL } from "@/lib/status-labels";

const STATUS_OPTIONS: Array<{ value: "" | WorkItemStatus; label: string }> = [
  { value: "", label: "전체" },
  { value: "SUBMITTED", label: WORK_ITEM_STATUS_LABEL.SUBMITTED },
  { value: "EVALUATING", label: WORK_ITEM_STATUS_LABEL.EVALUATING },
  { value: "DONE", label: WORK_ITEM_STATUS_LABEL.DONE },
  { value: "REJECTED", label: WORK_ITEM_STATUS_LABEL.REJECTED },
  { value: "DRAFT", label: WORK_ITEM_STATUS_LABEL.DRAFT },
];

export default function AdminQueuePage() {
  const [status, setStatus] = useState<"" | WorkItemStatus>("SUBMITTED");
  const [department, setDepartment] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");

  const listQuery = useQuery({
    queryKey: ["admin-work-items", status, department, keyword],
    queryFn: () =>
      getAdminWorkItems({
        status: status || undefined,
        department: department.trim() || undefined,
        q: keyword || undefined,
      }),
  });

  const items = listQuery.data?.items ?? [];

  const counts = useMemo(() => {
    return {
      total: items.length,
      submitted: items.filter((item) => item.status === "SUBMITTED").length,
      evaluating: items.filter((item) => item.status === "EVALUATING").length,
      done: items.filter((item) => item.status === "DONE").length,
      rejected: items.filter((item) => item.status === "REJECTED").length,
    };
  }, [items]);

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-xl font-bold text-slate-900">관리자 제출 큐</h1>
        <p className="mt-1 text-sm text-slate-500">
          상태/부서/검색 조건으로 업무 제출 현황을 조회합니다.
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
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
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
            onClick={() => setKeyword(searchInput.trim())}
            type="button"
            data-testid="admin-workitems-search-button"
          >
            검색
          </Button>
        </div>

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
                {items.map((item) => (
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
                    <td className="px-4 py-3">v{String(item.latestSubmissionVersion).padStart(3, "0")}</td>
                    <td className="px-4 py-3">{formatDateTime(item.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!listQuery.isLoading && items.length === 0 ? (
          <div className="text-sm text-slate-500">현재 조건에 맞는 업무가 없습니다.</div>
        ) : null}
      </div>
    </section>
  );
}
