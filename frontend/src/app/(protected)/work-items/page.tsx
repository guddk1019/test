"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMyWorkItems } from "@/lib/api/service";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { WorkItemStatus } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/utils";

const STATUS_OPTIONS: Array<{ value: "" | WorkItemStatus; label: string }> = [
  { value: "", label: "전체" },
  { value: "DRAFT", label: "초안" },
  { value: "SUBMITTED", label: "제출" },
  { value: "EVALUATING", label: "검토중" },
  { value: "DONE", label: "승인" },
  { value: "REJECTED", label: "반려" },
];

export default function WorkItemsPage() {
  const [status, setStatus] = useState<"" | WorkItemStatus>("");
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const query = useQuery({
    queryKey: ["work-items", status, keyword],
    queryFn: () => getMyWorkItems({ status, q: keyword }),
  });

  const total = useMemo(() => query.data?.length ?? 0, [query.data]);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">내 업무 목록</h1>
            <p className="mt-1 text-sm text-slate-500">총 {total}건</p>
          </div>
          <Link href="/work-items/new">
            <Button>업무 등록</Button>
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto]">
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
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="업무명/계획 검색"
          />
          <Button
            variant="secondary"
            onClick={() => setKeyword(searchInput.trim())}
            type="button"
          >
            검색
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {query.isLoading ? (
          <div className="p-6 text-sm text-slate-500">업무 목록을 불러오는 중...</div>
        ) : query.isError ? (
          <div className="p-6 text-sm font-medium text-rose-700">{query.error.message}</div>
        ) : query.data && query.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">업무명</th>
                  <th className="px-4 py-3">기한</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">최신 제출</th>
                  <th className="px-4 py-3">업데이트</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {query.data.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        className="font-semibold text-cyan-800 hover:underline"
                        href={`/work-items/${item.id}`}
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{formatDate(item.dueDate)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3">v{String(item.latestSubmissionVersion).padStart(3, "0")}</td>
                    <td className="px-4 py-3">{formatDateTime(item.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-sm text-slate-500">조건에 맞는 업무가 없습니다.</div>
        )}
      </div>
    </section>
  );
}
