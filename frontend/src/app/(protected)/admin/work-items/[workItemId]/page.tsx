"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteSubmissionFile,
  downloadSubmissionFile,
  getAdminWorkItemDetail,
  getWorkItemDetail,
  replaceSubmissionFile,
  reviewChangeRequest,
  reviewSubmission,
} from "@/lib/api/service";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBytes, formatDate, formatDateTime, shortHash } from "@/lib/utils";
import {
  AdminReviewRequest,
  ChangeRequestStatus,
  FileArtifact,
  ReviewChangeRequestRequest,
} from "@/lib/types";
import { CHANGE_REQUEST_STATUS_LABEL } from "@/lib/status-labels";

type ReviewFormState = {
  status: AdminReviewRequest["status"];
  comment: string;
};

type ChangeReviewFormState = {
  status: ReviewChangeRequestRequest["status"];
  comment: string;
};

function changeRequestStatusClass(status: ChangeRequestStatus): string {
  if (status === "APPROVED") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (status === "REJECTED") {
    return "bg-rose-100 text-rose-800";
  }
  return "bg-amber-100 text-amber-800";
}

export default function AdminWorkItemDetailPage() {
  const params = useParams<{ workItemId: string }>();
  const workItemId = Number(params.workItemId);
  const queryClient = useQueryClient();

  const [forms, setForms] = useState<Record<number, ReviewFormState>>({});
  const [changeForms, setChangeForms] = useState<Record<number, ChangeReviewFormState>>({});
  const [fileActionError, setFileActionError] = useState<string | null>(null);

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

  const reviewMutation = useMutation({
    mutationFn: (input: { submissionId: number; payload: AdminReviewRequest }) =>
      reviewSubmission(input.submissionId, input.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-work-item-detail", workItemId] });
      queryClient.invalidateQueries({ queryKey: ["admin-work-item-artifacts", workItemId] });
      queryClient.invalidateQueries({ queryKey: ["admin-work-items"] });
    },
  });

  const changeReviewMutation = useMutation({
    mutationFn: (input: { changeRequestId: number; payload: ReviewChangeRequestRequest }) =>
      reviewChangeRequest(input.changeRequestId, input.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-work-item-detail", workItemId] });
      queryClient.invalidateQueries({ queryKey: ["work-item-detail", workItemId] });
      queryClient.invalidateQueries({ queryKey: ["admin-work-items"] });
      queryClient.invalidateQueries({ queryKey: ["admin-change-requests"] });
    },
  });

  const replaceFileMutation = useMutation({
    mutationFn: (input: { submissionId: number; fileArtifactId: number; file: File }) =>
      replaceSubmissionFile(input.submissionId, input.fileArtifactId, input.file),
    onSuccess: () => {
      setFileActionError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-work-item-artifacts", workItemId] });
      queryClient.invalidateQueries({ queryKey: ["work-item-detail", workItemId] });
    },
    onError: (error: Error) => {
      setFileActionError(error.message);
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: (input: { submissionId: number; fileArtifactId: number }) =>
      deleteSubmissionFile(input.submissionId, input.fileArtifactId),
    onSuccess: () => {
      setFileActionError(null);
      queryClient.invalidateQueries({ queryKey: ["admin-work-item-artifacts", workItemId] });
      queryClient.invalidateQueries({ queryKey: ["work-item-detail", workItemId] });
      queryClient.invalidateQueries({ queryKey: ["admin-work-item-detail", workItemId] });
    },
    onError: (error: Error) => {
      setFileActionError(error.message);
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

  const defaultChangeForm = useMemo<ChangeReviewFormState>(
    () => ({
      status: "APPROVED",
      comment: "",
    }),
    [],
  );

  const onDownloadFile = async (
    submissionId: number,
    fileArtifactId: number,
    fileName: string,
  ) => {
    try {
      setFileActionError(null);
      await downloadSubmissionFile(submissionId, fileArtifactId, fileName);
    } catch (error) {
      const message = error instanceof Error ? error.message : "?뚯씪 ?ㅼ슫濡쒕뱶???ㅽ뙣?덉뒿?덈떎.";
      setFileActionError(message);
    }
  };

  if (detailQuery.isLoading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6">?곸꽭 ?뺣낫瑜?遺덈윭?ㅻ뒗 以묒엯?덈떎.</div>;
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

  const { workItem, submissions, changeRequests } = detailQuery.data;

  return (
    <section className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h1 className="text-xl font-bold text-slate-900">{workItem.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={workItem.status} />
          <span className="text-sm text-slate-500">
            ?대떦?? {workItem.ownerName} ({workItem.ownerEmployeeId}) / {workItem.ownerDepartment}
          </span>
        </div>
        <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
          <span>湲고븳: {formatDate(workItem.dueDate)}</span>
          <span>?앹꽦?? {formatDateTime(workItem.createdAt)}</span>
          <span>?섏젙?? {formatDateTime(workItem.updatedAt)}</span>
        </div>
        <p className="mt-4 whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm text-slate-700">{workItem.planText}</p>
      </div>

      <div className="space-y-4">
        {changeRequests.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            蹂寃??붿껌???놁뒿?덈떎.
          </div>
        ) : (
          changeRequests.map((changeRequest) => {
            const form = changeForms[changeRequest.id] ?? defaultChangeForm;
            const canReview = changeRequest.status === "REQUESTED";
            const isRejectWithoutComment = form.status === "REJECTED" && !form.comment.trim();

            return (
              <article key={changeRequest.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-semibold text-slate-900">
                    蹂寃쎌슂泥?v{String(changeRequest.version).padStart(3, "0")}
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${changeRequestStatusClass(changeRequest.status)}`}
                  >
                    {CHANGE_REQUEST_STATUS_LABEL[changeRequest.status]}
                  </span>
                </div>

                <div className="mt-3 text-sm text-slate-700">{changeRequest.changeText}</div>

                <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                  <span>?붿껌?? {changeRequest.requesterName}</span>
                  <span>蹂寃?湲고븳: {formatDate(changeRequest.proposedDueDate)}</span>
                  <span>寃???쒓컖: {formatDateTime(changeRequest.reviewedAt)}</span>
                </div>

                {changeRequest.proposedPlanText ? (
                  <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                    {changeRequest.proposedPlanText}
                  </p>
                ) : null}

                {changeRequest.reviewerComment ? (
                  <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                    寃??肄붾찘?? {changeRequest.reviewerComment}
                  </p>
                ) : null}

                {canReview ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-[170px_1fr_auto]">
                    <select
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                      value={form.status}
                      onChange={(event) =>
                        setChangeForms((prev) => ({
                          ...prev,
                          [changeRequest.id]: {
                            ...form,
                            status: event.target.value as ReviewChangeRequestRequest["status"],
                          },
                        }))
                      }
                    >
                      <option value="APPROVED">?뱀씤</option>
                      <option value="REJECTED">諛섎젮</option>
                    </select>
                    <input
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                      value={form.comment}
                      onChange={(event) =>
                        setChangeForms((prev) => ({
                          ...prev,
                          [changeRequest.id]: {
                            ...form,
                            comment: event.target.value,
                          },
                        }))
                      }
                      placeholder="검토 코멘트"
                    />
                    <Button
                      type="button"
                      variant={form.status === "REJECTED" ? "danger" : "primary"}
                      disabled={changeReviewMutation.isPending || isRejectWithoutComment}
                      onClick={() =>
                        changeReviewMutation.mutate({
                          changeRequestId: changeRequest.id,
                          payload: {
                            status: form.status,
                            comment: form.comment.trim() || undefined,
                          },
                        })
                      }
                    >
                      {changeReviewMutation.isPending ? "泥섎━ 以?.." : "?곸슜"}
                    </Button>
                  </div>
                ) : null}

                {canReview && isRejectWithoutComment ? (
                  <p className="mt-2 text-xs text-rose-700">諛섎젮 ??肄붾찘???낅젰???꾩슂?⑸땲??</p>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      <div className="space-y-4">
        {submissions.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            ?쒖텧 ?댁뿭???놁뒿?덈떎.
          </div>
        ) : (
          submissions.map((submission) => {
            const form = forms[submission.id] ?? defaultForm;
            const files = filesBySubmission.get(submission.id) ?? [];
            const isRejectWithoutComment = form.status === "REJECTED" && !form.comment.trim();

            return (
              <article
                key={submission.id}
                className="rounded-xl border border-slate-200 bg-white p-5"
                data-testid={`admin-submission-card-${submission.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-semibold text-slate-900">?쒖텧 v{String(submission.version).padStart(3, "0")}</div>
                  <StatusBadge status={submission.status} />
                </div>

                <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                  <span>?쒖텧 ?쒓컖: {formatDateTime(submission.submittedAt)}</span>
                  <span>?섏젙 ?쒓컖: {formatDateTime(submission.updatedAt)}</span>
                  <span>
                    ?뚯씪 ?? {files.length || submission.fileCount || 0}
                    {submission.changeRequestVersion
                      ? ` / 蹂寃쎌슂泥?v${String(submission.changeRequestVersion).padStart(3, "0")}`
                      : ""}
                  </span>
                </div>

                {submission.noteText ? (
                  <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">{submission.noteText}</p>
                ) : null}

                <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">파일명</th>
                        <th className="px-3 py-2">?ш린</th>
                        <th className="px-3 py-2">?뺤떇</th>
                        <th className="px-3 py-2">SHA256</th>
                        <th className="px-3 py-2">?묒뾽</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {files.length === 0 ? (
                        <tr>
                          <td className="px-3 py-2 text-slate-500" colSpan={5}>
                            ?뚯씪 硫뷀??곗씠?곌? ?놁뒿?덈떎.
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
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => onDownloadFile(submission.id, file.id, file.originalFilename)}
                                >
                                  ?ㅼ슫濡쒕뱶
                                </Button>
                                {submission.status === "UPLOADING" || submission.status === "SUBMITTED" ? (
                                  <>
                                    <label className="inline-flex h-8 cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                      ?섏젙
                                      <input
                                        className="hidden"
                                        type="file"
                                        onChange={(event) => {
                                          const nextFile = event.target.files?.[0];
                                          event.currentTarget.value = "";
                                          if (!nextFile) {
                                            return;
                                          }
                                          replaceFileMutation.mutate({
                                            submissionId: submission.id,
                                            fileArtifactId: file.id,
                                            file: nextFile,
                                          });
                                        }}
                                      />
                                    </label>
                                    {submission.status === "UPLOADING" || submission.status === "SUBMITTED" ? (
                                      <Button
                                        type="button"
                                        variant="danger"
                                        className="h-8 px-2 text-xs"
                                        disabled={deleteFileMutation.isPending}
                                        onClick={() => {
                                          const shouldDelete = window.confirm("???뚯씪????젣?섏떆寃좎뒿?덇퉴?");
                                          if (!shouldDelete) {
                                            return;
                                          }
                                          deleteFileMutation.mutate({
                                            submissionId: submission.id,
                                            fileArtifactId: file.id,
                                          });
                                        }}
                                      >
                                        ??젣
                                      </Button>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className="text-[11px] font-medium text-slate-500">
                                    ?섏젙 遺덇? ({submission.status})
                                  </span>
                                )}
                              </div>
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
                    data-testid={`admin-submission-status-${submission.id}`}
                    onChange={(event) =>
                      setForms((prev) => ({
                        ...prev,
                        [submission.id]: {
                          ...form,
                          status: event.target.value as AdminReviewRequest["status"],
                        },
                      }))
                    }
                  >
                    <option value="DONE">?뱀씤</option>
                    <option value="REJECTED">諛섎젮</option>
                    <option value="EVALUATING">평가중</option>
                  </select>
                  <input
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm"
                    value={form.comment}
                    onChange={(event) =>
                      setForms((prev) => ({
                        ...prev,
                        [submission.id]: {
                          ...form,
                          comment: event.target.value,
                        },
                      }))
                    }
                    placeholder="검토 코멘트"
                  />
                  <Button
                    type="button"
                    variant={form.status === "REJECTED" ? "danger" : "primary"}
                    disabled={reviewMutation.isPending || isRejectWithoutComment}
                    data-testid={`admin-submission-apply-${submission.id}`}
                    onClick={() =>
                      reviewMutation.mutate({
                        submissionId: submission.id,
                        payload: {
                          status: form.status,
                          comment: form.comment.trim() || undefined,
                        },
                      })
                    }
                  >
                    {reviewMutation.isPending ? "泥섎━ 以?.." : "?곸슜"}
                  </Button>
                </div>

                {isRejectWithoutComment ? (
                  <p className="mt-2 text-xs text-rose-700">諛섎젮 ??肄붾찘???낅젰???꾩슂?⑸땲??</p>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      {fileActionError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {fileActionError}
        </div>
      ) : null}
    </section>
  );
}


