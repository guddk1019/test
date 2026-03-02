"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createWorkItemComment,
  getWorkItemComments,
} from "@/lib/api/service";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { WorkItemComment } from "@/lib/types";

interface SubmissionOption {
  id: number;
  version: number;
}

interface WorkItemCommentsPanelProps {
  workItemId: number;
  submissions: SubmissionOption[];
}

interface CommentWithDepth {
  comment: WorkItemComment;
  depth: number;
}

function buildCommentRows(comments: WorkItemComment[]): CommentWithDepth[] {
  const childrenByParent = new Map<number | null, WorkItemComment[]>();
  for (const comment of comments) {
    const key = comment.parentCommentId ?? null;
    const list = childrenByParent.get(key) ?? [];
    list.push(comment);
    childrenByParent.set(key, list);
  }

  const rows: CommentWithDepth[] = [];
  const walk = (parentId: number | null, depth: number) => {
    const children = childrenByParent.get(parentId) ?? [];
    for (const child of children) {
      rows.push({ comment: child, depth });
      walk(child.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

export function WorkItemCommentsPanel({
  workItemId,
  submissions,
}: WorkItemCommentsPanelProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [commentText, setCommentText] = useState("");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [replyTo, setReplyTo] = useState<WorkItemComment | null>(null);

  const commentsQuery = useQuery({
    queryKey: ["work-item-comments", workItemId],
    queryFn: () => getWorkItemComments(workItemId),
    enabled: Number.isFinite(workItemId) && workItemId > 0,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createWorkItemComment(workItemId, {
        commentText: commentText.trim(),
        submissionId: selectedSubmissionId ? Number(selectedSubmissionId) : undefined,
        parentCommentId: replyTo?.id,
      }),
    onSuccess: () => {
      setCommentText("");
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ["work-item-comments", workItemId] });
    },
  });

  const rows = useMemo(
    () => buildCommentRows(commentsQuery.data?.comments ?? []),
    [commentsQuery.data?.comments],
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate-900">댓글 스레드</h2>
      </div>

      <div className="space-y-3 border-b border-slate-200 px-6 py-4">
        {replyTo ? (
          <div className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
            답글 대상: {replyTo.authorName} - {replyTo.commentText.slice(0, 80)}
            <button
              type="button"
              className="ml-2 font-semibold underline"
              onClick={() => setReplyTo(null)}
            >
              취소
            </button>
          </div>
        ) : null}

        <textarea
          className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={commentText}
          onChange={(event) => setCommentText(event.target.value)}
          placeholder="업무 진행 관련 코멘트를 입력하세요."
        />

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-10 min-w-52 rounded-md border border-slate-300 px-3 text-sm"
            value={selectedSubmissionId}
            onChange={(event) => setSelectedSubmissionId(event.target.value)}
          >
            <option value="">업무 전체</option>
            {submissions.map((submission) => (
              <option key={submission.id} value={String(submission.id)}>
                제출 v{String(submission.version).padStart(3, "0")}
              </option>
            ))}
          </select>

          <Button
            type="button"
            disabled={createMutation.isPending || commentText.trim().length === 0}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "등록 중..." : "댓글 등록"}
          </Button>
        </div>

        {createMutation.isError ? (
          <p className="text-sm text-rose-700">{createMutation.error.message}</p>
        ) : null}
      </div>

      {commentsQuery.isLoading ? (
        <div className="px-6 py-5 text-sm text-slate-500">댓글을 불러오는 중입니다.</div>
      ) : commentsQuery.isError ? (
        <div className="px-6 py-5 text-sm text-rose-700">{commentsQuery.error.message}</div>
      ) : rows.length === 0 ? (
        <div className="px-6 py-5 text-sm text-slate-500">등록된 댓글이 없습니다.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map(({ comment, depth }) => (
            <li key={comment.id} className="px-6 py-4" style={{ marginLeft: `${depth * 12}px` }}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-800">{comment.authorName}</span>
                <span>({comment.authorEmployeeId})</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  {comment.authorRole === "ADMIN" ? "관리자" : "직원"}
                </span>
                {comment.submissionVersion ? (
                  <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">
                    제출 v{String(comment.submissionVersion).padStart(3, "0")}
                  </span>
                ) : null}
                <span>{formatDateTime(comment.createdAt)}</span>
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{comment.commentText}</p>

              {user ? (
                <div className="mt-2">
                  <button
                    type="button"
                    className="text-xs font-semibold text-cyan-700 hover:underline"
                    onClick={() => {
                      setReplyTo(comment);
                      if (comment.submissionId) {
                        setSelectedSubmissionId(String(comment.submissionId));
                      }
                    }}
                  >
                    답글
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
