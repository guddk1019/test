"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createChangeRequest, getWorkItemDetail } from "@/lib/api/service";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate, formatDateTime, shortHash } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { ChangeRequestStatus } from "@/lib/types";

function changeRequestStatusClass(status: ChangeRequestStatus): string {
  if (status === "APPROVED") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (status === "REJECTED") {
    return "bg-rose-100 text-rose-800";
  }
  return "bg-amber-100 text-amber-800";
}

export default function WorkItemDetailPage() {
  const params = useParams<{ workItemId: string }>();
  const workItemId = Number(params.workItemId);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [changeText, setChangeText] = useState("");
  const [proposedPlanText, setProposedPlanText] = useState("");
  const [proposedDueDate, setProposedDueDate] = useState("");

  const query = useQuery({
    queryKey: ["work-item-detail", workItemId],
    queryFn: () => getWorkItemDetail(workItemId),
    enabled: Number.isFinite(workItemId) && workItemId > 0,
  });

  const createChangeRequestMutation = useMutation({
    mutationFn: () =>
      createChangeRequest(workItemId, {
        changeText: changeText.trim(),
        proposedPlanText: proposedPlanText.trim() || undefined,
        proposedDueDate: proposedDueDate || undefined,
      }),
    onSuccess: () => {
      setChangeText("");
      setProposedPlanText("");
      setProposedDueDate("");
      queryClient.invalidateQueries({ queryKey: ["work-item-detail", workItemId] });
    },
  });

  const onCreateChangeRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createChangeRequestMutation.mutate();
  };

  if (query.isLoading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6">Loading work item...</div>;
  }
  if (query.isError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
        {query.error.message}
      </div>
    );
  }
  if (!query.data) {
    return null;
  }

  const { workItem, submissions, changeRequests } = query.data;
  const canRequestChange = user?.role === "EMPLOYEE";

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{workItem.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Owner: {workItem.ownerName} ({workItem.ownerEmployeeId}) / {workItem.ownerDepartment}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={workItem.status} />
            <Link href={`/work-items/${workItem.id}/submit`}>
              <Button>Submit Result</Button>
            </Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-slate-500">Due Date</div>
            <div className="mt-1 font-semibold text-slate-800">{formatDate(workItem.dueDate)}</div>
          </div>
          <div>
            <div className="text-slate-500">Created At</div>
            <div className="mt-1 font-semibold text-slate-800">{formatDateTime(workItem.createdAt)}</div>
          </div>
          <div>
            <div className="text-slate-500">Updated At</div>
            <div className="mt-1 font-semibold text-slate-800">{formatDateTime(workItem.updatedAt)}</div>
          </div>
        </div>
        <div className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Plan</h2>
          <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
            {workItem.planText}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Change Requests</h2>
        </div>

        {canRequestChange ? (
          <form className="space-y-3 border-b border-slate-200 px-6 py-4" onSubmit={onCreateChangeRequest}>
            <textarea
              className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={changeText}
              onChange={(event) => setChangeText(event.target.value)}
              placeholder="Why this change is needed"
              required
            />
            <textarea
              className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={proposedPlanText}
              onChange={(event) => setProposedPlanText(event.target.value)}
              placeholder="Proposed updated plan text (optional)"
            />
            <div className="flex flex-wrap items-center gap-3">
              <input
                className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                type="date"
                value={proposedDueDate}
                onChange={(event) => setProposedDueDate(event.target.value)}
              />
              <Button
                disabled={createChangeRequestMutation.isPending || !changeText.trim()}
                type="submit"
              >
                {createChangeRequestMutation.isPending ? "Submitting..." : "Request Change"}
              </Button>
            </div>
            {createChangeRequestMutation.isError ? (
              <p className="text-sm font-medium text-rose-700">
                {createChangeRequestMutation.error.message}
              </p>
            ) : null}
          </form>
        ) : null}

        {changeRequests.length === 0 ? (
          <div className="px-6 py-6 text-sm text-slate-500">No change requests yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {changeRequests.map((changeRequest) => (
              <li key={changeRequest.id} className="space-y-2 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900">
                    v{String(changeRequest.version).padStart(3, "0")}
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${changeRequestStatusClass(changeRequest.status)}`}
                  >
                    {changeRequest.status}
                  </span>
                </div>
                <div className="text-sm text-slate-700">{changeRequest.changeText}</div>
                <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                  <span>Requester: {changeRequest.requesterName}</span>
                  <span>Proposed due: {formatDate(changeRequest.proposedDueDate)}</span>
                  <span>Reviewed: {formatDateTime(changeRequest.reviewedAt)}</span>
                </div>
                {changeRequest.proposedPlanText ? (
                  <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                    {changeRequest.proposedPlanText}
                  </p>
                ) : null}
                {changeRequest.reviewerComment ? (
                  <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                    Reviewer: {changeRequest.reviewerComment}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Submission History</h2>
        </div>
        {submissions.length === 0 ? (
          <div className="px-6 py-6 text-sm text-slate-500">No submissions yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {submissions.map((submission) => (
              <li key={submission.id} className="space-y-3 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-semibold text-slate-900">
                    v{String(submission.version).padStart(3, "0")}
                  </div>
                  <StatusBadge status={submission.status} />
                </div>
                <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                  <span>Submitted: {formatDateTime(submission.submittedAt)}</span>
                  <span>Updated: {formatDateTime(submission.updatedAt)}</span>
                  <span>
                    Files: {submission.files?.length ?? 0}
                    {submission.changeRequestVersion
                      ? ` / Change v${String(submission.changeRequestVersion).padStart(3, "0")}`
                      : ""}
                  </span>
                </div>
                {submission.noteText ? (
                  <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                    {submission.noteText}
                  </p>
                ) : null}
                <div className="overflow-hidden rounded-md border border-slate-200">
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
                      {(submission.files ?? []).length === 0 ? (
                        <tr>
                          <td className="px-3 py-2 text-slate-500" colSpan={4}>
                            No files attached.
                          </td>
                        </tr>
                      ) : (
                        (submission.files ?? []).map((file) => (
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
