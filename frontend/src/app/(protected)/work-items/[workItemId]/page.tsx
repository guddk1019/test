"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getWorkItemDetail } from "@/lib/api/service";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDate, formatDateTime, shortHash } from "@/lib/utils";

export default function WorkItemDetailPage() {
  const params = useParams<{ workItemId: string }>();
  const workItemId = Number(params.workItemId);

  const query = useQuery({
    queryKey: ["work-item-detail", workItemId],
    queryFn: () => getWorkItemDetail(workItemId),
    enabled: Number.isFinite(workItemId) && workItemId > 0,
  });

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

  const { workItem, submissions } = query.data;

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
                  <span>Files: {submission.files?.length ?? 0}</span>
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
