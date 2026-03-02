import { ChangeRequestStatus, SubmissionStatus, WorkItemStatus } from "./types";

export const WORK_ITEM_STATUS_LABEL: Record<WorkItemStatus, string> = {
  DRAFT: "초안",
  SUBMITTED: "제출",
  EVALUATING: "검토중",
  DONE: "승인",
  REJECTED: "반려",
};

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  UPLOADING: "초안",
  SUBMITTED: "제출",
  EVALUATING: "검토중",
  DONE: "승인",
  REJECTED: "반려",
};

export const CHANGE_REQUEST_STATUS_LABEL: Record<ChangeRequestStatus, string> = {
  REQUESTED: "요청",
  APPROVED: "승인",
  REJECTED: "반려",
};
