"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createSubmission,
  finalizeSubmission,
  uploadSubmissionFiles,
} from "@/lib/api/service";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { FinalizeSubmissionResponse } from "@/lib/types";

export default function SubmitResultPage() {
  const params = useParams<{ workItemId: string }>();
  const workItemId = Number(params.workItemId);
  const queryClient = useQueryClient();

  const [noteText, setNoteText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [result, setResult] = useState<FinalizeSubmissionResponse["submission"] | null>(null);

  const canSubmit = useMemo(
    () => Number.isFinite(workItemId) && workItemId > 0 && files.length > 0,
    [files.length, workItemId],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const created = await createSubmission(workItemId);
      await uploadSubmissionFiles(created.submission.id, files, setUploadPercent);
      const finalized = await finalizeSubmission(created.submission.id, {
        noteText: noteText.trim() || undefined,
      });
      return finalized.submission;
    },
    onSuccess: (submission) => {
      setResult(submission);
      queryClient.invalidateQueries({ queryKey: ["work-item-detail", workItemId] });
      queryClient.invalidateQueries({ queryKey: ["work-items"] });
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-bold text-slate-900">결과 제출</h1>
        <p className="mt-2 text-sm text-slate-500">
          제출 생성(v001/v002...) 후 파일 업로드, 제출 확정 순서로 처리됩니다.
        </p>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">결과 파일</label>
            <input
              className="block w-full rounded-md border border-slate-300 p-2 text-sm"
              type="file"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
            <p className="mt-1 text-xs text-slate-500">
              총 {files.length}개 파일 선택됨 (필수)
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              결과 요약 코멘트 (선택)
            </label>
            <textarea
              className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="산출물 핵심 요약"
            />
          </div>

          {mutation.isPending ? (
            <div className="rounded-md bg-cyan-50 p-3 text-sm text-cyan-800">
              업로드 진행률: {uploadPercent}%
            </div>
          ) : null}
          {mutation.isError ? (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
              {mutation.error.message}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Button disabled={!canSubmit || mutation.isPending} type="submit">
              {mutation.isPending ? "제출 처리 중..." : "제출 확정"}
            </Button>
            <Link href={`/work-items/${workItemId}`}>
              <Button variant="secondary" type="button">
                상세로 돌아가기
              </Button>
            </Link>
          </div>
        </form>
      </div>

      {result ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="font-semibold text-emerald-900">제출 완료</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-emerald-900">
            <span>Submission ID: {result.id}</span>
            <StatusBadge status={result.status} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
