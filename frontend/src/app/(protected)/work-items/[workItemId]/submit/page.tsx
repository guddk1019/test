"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSubmission,
  finalizeSubmission,
  getWorkItemDetail,
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
  const [selectedChangeRequestId, setSelectedChangeRequestId] = useState("");
  const [result, setResult] = useState<FinalizeSubmissionResponse["submission"] | null>(null);

  const detailQuery = useQuery({
    queryKey: ["work-item-detail", workItemId],
    queryFn: () => getWorkItemDetail(workItemId),
    enabled: Number.isFinite(workItemId) && workItemId > 0,
  });

  const approvedChangeRequests = useMemo(
    () =>
      (detailQuery.data?.changeRequests ?? []).filter(
        (changeRequest) => changeRequest.status === "APPROVED",
      ),
    [detailQuery.data?.changeRequests],
  );

  const canSubmit = useMemo(
    () => Number.isFinite(workItemId) && workItemId > 0 && files.length > 0,
    [files.length, workItemId],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const created = await createSubmission(workItemId, {
        changeRequestId: selectedChangeRequestId
          ? Number(selectedChangeRequestId)
          : undefined,
      });
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
        <h1 className="text-xl font-bold text-slate-900">寃곌낵 ?쒖텧</h1>
        <p className="mt-2 text-sm text-slate-500">
          ?쒖텧 踰꾩쟾???앹꽦?섍퀬 ?뚯씪 ?낅줈?????쒖텧???뺤젙?섏꽭??
        </p>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              寃곌낵 ?뚯씪
            </label>
            <input
              className="block w-full rounded-md border border-slate-300 p-2 text-sm"
              type="file"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
            <p className="mt-1 text-xs text-slate-500">
              {files.length}媛??뚯씪 ?좏깮??            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              ?곌껐??蹂寃쎌슂泥?(?좏깮)
            </label>
            <select
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
              value={selectedChangeRequestId}
              onChange={(event) => setSelectedChangeRequestId(event.target.value)}
            >
              <option value="">?놁쓬</option>
              {approvedChangeRequests.map((changeRequest) => (
                <option key={changeRequest.id} value={String(changeRequest.id)}>
                  v{String(changeRequest.version).padStart(3, "0")} - {changeRequest.changeText}
                </option>
              ))}
            </select>
            {detailQuery.isError ? (
              <p className="mt-1 text-xs text-rose-700">{detailQuery.error.message}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              寃곌낵 ?붿빟 (?좏깮)
            </label>
            <textarea
              className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="?쒖텧 ?댁슜??媛꾨떒???낅젰?섏꽭??"
            />
          </div>

          {mutation.isPending ? (
            <div className="rounded-md bg-cyan-50 p-3 text-sm text-cyan-800">
              ?낅줈??吏꾪뻾瑜? {uploadPercent}%
            </div>
          ) : null}
          {mutation.isError ? (
            <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
              {mutation.error.message}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Button disabled={!canSubmit || mutation.isPending} type="submit">
              {mutation.isPending ? "?쒖텧 以?.." : "?쒖텧 ?뺤젙"}
            </Button>
            <Link href={`/work-items/${workItemId}`}>
              <Button variant="secondary" type="button">
                ?곸꽭濡??뚯븘媛湲?              </Button>
            </Link>
          </div>
        </form>
      </div>

      {result ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5" data-testid="submission-result">
          <h2 className="font-semibold text-emerald-900">?쒖텧???꾨즺?섏뿀?듬땲??</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-emerald-900">
            <span data-testid="submission-result-id">제출 ID: {result.id}</span>
            <StatusBadge status={result.status} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

