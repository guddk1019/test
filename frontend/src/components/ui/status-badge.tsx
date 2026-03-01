import { SubmissionStatus, WorkItemStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SUBMISSION_STATUS_LABEL, WORK_ITEM_STATUS_LABEL } from "@/lib/status-labels";

type Status = SubmissionStatus | WorkItemStatus;

interface StatusBadgeProps {
  status: Status;
}

const STATUS_CLASS: Record<Status, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  UPLOADING: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-blue-100 text-blue-800",
  EVALUATING: "bg-amber-100 text-amber-800",
  DONE: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
};

function statusLabel(status: Status): string {
  if (status in SUBMISSION_STATUS_LABEL) {
    return SUBMISSION_STATUS_LABEL[status as SubmissionStatus];
  }
  return WORK_ITEM_STATUS_LABEL[status as WorkItemStatus];
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        STATUS_CLASS[status],
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
