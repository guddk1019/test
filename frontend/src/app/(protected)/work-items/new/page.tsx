"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createWorkItem } from "@/lib/api/service";
import { Button } from "@/components/ui/button";

export default function WorkItemCreatePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [planText, setPlanText] = useState("");
  const [dueDate, setDueDate] = useState("");

  const mutation = useMutation({
    mutationFn: createWorkItem,
    onSuccess: (data) => {
      router.replace(`/work-items/${data.item.id}`);
      router.refresh();
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate({ title, planText, dueDate });
  };

  return (
    <section className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">업무 계획 등록</h1>
        <p className="mt-1 text-sm text-slate-500">업무명, 목표, 기한을 입력해 업무를 생성합니다.</p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">업무명</label>
          <input
            className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 1분기 매출 분석 보고서"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">계획/목표</label>
          <textarea
            className="min-h-32 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={planText}
            onChange={(event) => setPlanText(event.target.value)}
            placeholder="이번 업무에서 달성할 목표를 구체적으로 입력"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">기한</label>
          <input
            className="h-11 rounded-md border border-slate-300 px-3 text-sm"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            required
          />
        </div>

        {mutation.isError ? (
          <p className="text-sm font-medium text-rose-700">{mutation.error.message}</p>
        ) : null}

        <div className="flex items-center gap-2">
          <Button disabled={mutation.isPending} type="submit">
            {mutation.isPending ? "등록 중..." : "업무 등록"}
          </Button>
          <Link href="/work-items">
            <Button variant="secondary" type="button">
              목록으로
            </Button>
          </Link>
        </div>
      </form>
    </section>
  );
}
