"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdminWorkItemDetail, getWorkItemDetail, reviewSubmission } from "@/lib/api/service";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBytes, formatDate, formatDateTime, shortHash } from "@/lib/utils";
import { AdminReviewRequest, FileArtifact } from "@/lib/types";

type ReviewFormState = {
  status: AdminReviewRequest["status"];
  comment: string;
};

export default function AdminWorkItemDetailPage() {
  const params = useParams<{ workItemId: string }>();
  const workItemId = Number(params.workItemId);
  const queryClient = useQueryClient();
  const [forms, setForms] = useState<Record<number, ReviewFormState>>({});

  const detailQuery = useQuery({
    queryKey: ["admin-work-item-detail", workItemId],
    queryFn: () => getAdminWorkItemDetail(workItemId),
    enabled: Number.isFinite(workItemId) && workItemId > 0,
  });

  const artifactQuery = useQuery({
    queryKey: ["admin-work-item-artifacts", workItemId],
    queryFn: () => getWorkItemDetail(workItemId),
    enabled: Number.isFinite(workItemId) && workItemId > 0,
  });

  const mutation = useMutation({
    mutationFn: (input: { submissionId: number; payload: AdminReviewRequest }) =>
      reviewSubmission(input.submissionId, input.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-work-item-detail", workItemId] });
      queryClient.invalidateQueries({ queryKey: ["admin-work-item-artifacts", workItemId] });
      queryClient.invalidateQueries({ queryKey: ["admin-work-items"] });
    },
  });

  const filesBySubmission = useMemo(() => {
    const map = new Map<number, FileArtifact[]>();
    for (const submission of artifactQuery.data?.submissions ?? []) {
      map.set(submission.id, submission.files ?? []);
    }
    return map;
  }, [artifactQuery.data?.submissions]);

  const defaultForm = useMemo<ReviewFormState>(
    () => ({
      status: "DONE",
      comment: "",
    }),
    [],
  );

  if (detailQuery.isLoading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6">Loading detail...</div>;
  }
  if (detailQuery.isError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
        {detailQuery.error.message}
      </div>
    );
  }
  if (!detailQuery.data) {
    return null;
  }

  const { workItem, submissions } = detailQuery.data;

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-bold text-slate-900">{workItem.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={workItem.status} />
          <span className="text-sm text-slate-500">
            Owner: {workItem.ownerName} ({workItem.ownerEmployeeId}) / {workItem.ownerDepartment}
          </span>
        </div>
        <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
          <span>Due: {formatDate(workItem.dueDate)}</span>
          <span>Created: {formatDateTime(workItem.createdAt)}</span>
          <span>Updated: {formatDateTime(workItem.updatedAt)}</span>
        </div>
        <p className="mt-4 whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm text-slate-700">
          {workItem.planText}
        </p>
      </div>

      <div className="space-y-4">
        {submissions.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            No submissions found.
          </div>
        ) : (
          submissions.map((submission) => {
            const form = forms[submission.id] ?? defaultForm;
            const files = filesBySubmission.get(submission.id) ?? [];
            return (
              <article
                key={submission.id}
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-semibold text-slate-900">
                    Submission v{String(submission.version).padStart(3, "0")}
                  </div>
                  <StatusBadge status={submission.status} />
                </div>

                <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                  <span>Submitted: {formatDateTime(submission.submittedAt)}</span>
                  <span>Updated: {formatDateTime(submission.updatedAt)}</span>
                  <span>Files: {files.length || submission.fileCount || 0}</span>
                </div>

                {submission.noteText ? (
                  <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                    {submission.noteText}
                  </p>
                ) : null}

                <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">File</th>
                        <th className="px-3 py-2">Size</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">SHA256</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {files.length === 0 ? (
                        <tr>
                          <td className="px-3 py-2 text-slate-500" colSpan={4}>
                            No file metadata loaded.
                          </td>
                        </tr>
                      ) : (
                        files.map((file) => (
                          <tr key={file.id}>
                            <td className="px-3 py-2 text-slate-700">{file.originalFilename}</td>
                            <td className="px-3 py-2 text-slate-600">{formatBytes(file.sizeBytes)}</td>
                            <td className="px-3 py-2 text-slate-600">{file.mimeType}</td>
                            <td className="px-3 py-2 font-mono text-slate-600" title={file.sha256}>
                              {shortHash(file.sha256)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-[170px_1fr_auto]">
                  <select
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                    value={form.status}
                    onChange={(event) =>
                      setForms((previous) => ({
                        ...previous,
                        [submission.id]: {
                          ...form,
                          status: event.target.value as AdminReviewRequest["status"],
                        },
                      }))
                    }
                  >
                    <option value="DONE">Approve (DONE)</option>
                    <option value="REJECTED">Reject (REJECTED)</option>
                    <option value="EVALUATING">Evaluating (EVALUATING)</option>
                  </select>
                  <input
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                    value={form.comment}
                    onChange={(event) =>
                      setForms((previous) => ({
                        ...previous,
                        [submission.id]: {
                          ...form,
                          comment: event.target.value,
                        },
                      }))
                    }
                    placeholder="Review comment"
                  />
                  <Button
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        submissionId: submission.id,
                        payload: {
                          status: form.status,
                          comment: form.comment.trim() || undefined,
                        },
                      })
                    }
                    type="button"
                    variant={form.status === "REJECTED" ? "danger" : "primary"}
                  >
                    {mutation.isPending ? "Saving..." : "Apply"}
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
