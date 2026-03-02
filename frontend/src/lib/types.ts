export type UserRole = "EMPLOYEE" | "ADMIN";

export type WorkItemStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "EVALUATING"
  | "DONE"
  | "REJECTED";

export type SubmissionStatus =
  | "UPLOADING"
  | "SUBMITTED"
  | "EVALUATING"
  | "DONE"
  | "REJECTED";

export type ChangeRequestStatus = "REQUESTED" | "APPROVED" | "REJECTED";

export interface AuthUser {
  id: number;
  employeeId: string;
  fullName: string;
  department: string;
  role: UserRole;
}

export interface LoginRequest {
  employeeId: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface WorkItemSummary {
  id: number;
  title: string;
  dueDate: string;
  status: WorkItemStatus;
  createdAt: string;
  updatedAt: string;
  latestSubmissionVersion: number;
}

export interface WorkItemDetail {
  id: number;
  ownerUserId: number;
  ownerEmployeeId: string;
  ownerName: string;
  ownerDepartment: string;
  title: string;
  planText: string;
  dueDate: string;
  status: WorkItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FileArtifact {
  id: number;
  originalFilename: string;
  storedFilename: string;
  nasPath: string;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
  createdAt: string;
}

export interface SubmissionDetail {
  id: number;
  version: number;
  status: SubmissionStatus;
  changeRequestId?: number | null;
  changeRequestVersion?: number | null;
  noteText: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  files?: FileArtifact[];
  fileCount?: number;
}

export interface ChangeRequestDetail {
  id: number;
  workItemId: number;
  requesterUserId: number;
  requesterEmployeeId: string;
  requesterName: string;
  version: number;
  status: ChangeRequestStatus;
  changeText: string;
  proposedPlanText: string | null;
  proposedDueDate: string | null;
  reviewerUserId: number | null;
  reviewerName?: string | null;
  reviewerComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemDetailResponse {
  workItem: WorkItemDetail;
  submissions: SubmissionDetail[];
  changeRequests: ChangeRequestDetail[];
}

export interface CreateWorkItemRequest {
  title: string;
  planText: string;
  dueDate: string;
}

export interface CreateWorkItemResponse {
  item: {
    id: number;
    ownerUserId: number;
    title: string;
    planText: string;
    dueDate: string;
    status: WorkItemStatus;
    createdAt: string;
    updatedAt: string;
  };
}

export interface CreateSubmissionResponse {
  submission: {
    id: number;
    workItemId: number;
    version: number;
    changeRequestId: number | null;
    status: SubmissionStatus;
    createdAt: string;
  };
}

export interface UploadResult {
  id: number;
  originalFilename: string;
  storedFilename: string;
  nasPath: string;
  sizeBytes: number;
  sha256: string;
  mimeType: string;
  createdAt: string;
}

export interface UploadResponse {
  uploaded: UploadResult[];
}

export interface ReplaceSubmissionFileResponse {
  file: UploadResult;
}

export interface DeleteSubmissionFileResponse {
  deleted: {
    id: number;
  };
}

export interface FinalizeSubmissionRequest {
  noteText?: string;
}

export interface FinalizeSubmissionResponse {
  submission: {
    id: number;
    workItemId: number;
    version: number;
    status: SubmissionStatus;
    noteText: string | null;
    submittedAt: string | null;
  };
}

export interface SubmissionStatusResponse {
  submission: {
    id: number;
    workItemId: number;
    changeRequestId: number | null;
    status: SubmissionStatus;
    noteText: string | null;
    submittedAt: string | null;
    updatedAt: string;
  };
}

export interface AdminWorkItemSummary {
  id: number;
  title: string;
  dueDate: string;
  status: WorkItemStatus;
  ownerUserId: number;
  ownerEmployeeId: string;
  ownerName: string;
  ownerDepartment: string;
  latestSubmissionVersion: number;
  updatedAt: string;
}

export interface AdminWorkItemListResponse {
  items: AdminWorkItemSummary[];
}

export interface AdminChangeRequestSummary {
  id: number;
  workItemId: number;
  workItemTitle: string;
  requesterUserId: number;
  requesterEmployeeId: string;
  requesterName: string;
  version: number;
  status: ChangeRequestStatus;
  changeText: string;
  proposedDueDate: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminChangeRequestListResponse {
  items: AdminChangeRequestSummary[];
}

export interface AdminWorkItemDetailResponse {
  workItem: WorkItemDetail;
  submissions: SubmissionDetail[];
  changeRequests: ChangeRequestDetail[];
}

export interface AdminReviewRequest {
  status: "REJECTED" | "EVALUATING" | "DONE";
  comment?: string;
}

export interface AdminReviewResponse {
  submission: {
    id: number;
    workItemId: number;
    version: number;
    status: SubmissionStatus;
    noteText: string | null;
    submittedAt: string | null;
    updatedAt: string;
  };
  comment: string | null;
}

export interface CreateChangeRequestRequest {
  changeText: string;
  proposedPlanText?: string;
  proposedDueDate?: string;
}

export interface CreateChangeRequestResponse {
  changeRequest: ChangeRequestDetail;
}

export interface ReviewChangeRequestRequest {
  status: "APPROVED" | "REJECTED";
  comment?: string;
}

export interface ReviewChangeRequestResponse {
  changeRequest: {
    id: number;
    workItemId: number;
    version: number;
    status: ChangeRequestStatus;
    changeText: string;
    proposedPlanText: string | null;
    proposedDueDate: string | null;
    reviewerUserId: number | null;
    reviewerComment: string | null;
    reviewedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  comment: string | null;
}

export type NotificationType =
  | "SUBMISSION_SUBMITTED"
  | "SUBMISSION_REVIEWED"
  | "CHANGE_REQUEST_CREATED"
  | "CHANGE_REQUEST_REVIEWED"
  | "COMMENT_CREATED";

export interface NotificationItem {
  id: number;
  recipientUserId: number;
  actorUserId: number | null;
  actorEmployeeId: string | null;
  actorName: string | null;
  type: NotificationType;
  title: string;
  message: string;
  workItemId: number | null;
  submissionId: number | null;
  changeRequestId: number | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  meta: Record<string, unknown>;
  targetPath: string | null;
}

export interface NotificationListResponse {
  unreadCount: number;
  items: NotificationItem[];
}

export interface MarkNotificationReadResponse {
  notification: {
    id: number;
    isRead: boolean;
    readAt: string | null;
  };
}

export interface MarkAllNotificationsReadResponse {
  updatedCount: number;
}

export interface WorkItemComment {
  id: number;
  workItemId: number;
  submissionId: number | null;
  submissionVersion: number | null;
  authorUserId: number;
  authorEmployeeId: string;
  authorName: string;
  authorRole: UserRole;
  parentCommentId: number | null;
  commentText: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemCommentsResponse {
  comments: WorkItemComment[];
}

export interface CreateWorkItemCommentRequest {
  commentText: string;
  submissionId?: number;
  parentCommentId?: number;
}

export interface CreateWorkItemCommentResponse {
  comment: WorkItemComment;
}

export type DashboardSubmissionStatus =
  | "UPLOADING"
  | "SUBMITTED"
  | "EVALUATING"
  | "DONE"
  | "REJECTED";

export interface AdminDashboardSummary {
  totalSubmissions: number;
  approvedCount: number;
  rejectedCount: number;
  reviewingCount: number;
  uploadingCount: number;
  avgProcessingHours: number | null;
  medianProcessingHours: number | null;
}

export interface AdminDashboardEmployeePerformance {
  ownerEmployeeId: string;
  ownerName: string;
  ownerDepartment: string;
  total: number;
  done: number;
  rejected: number;
  avgProcessingHours: number | null;
}

export interface AdminDashboardSubmissionRow {
  submissionId: number;
  submissionVersion: number;
  submissionStatus: DashboardSubmissionStatus;
  submittedAt: string | null;
  updatedAt: string;
  processingHours: number | null;
  workItemId: number;
  workItemTitle: string;
  ownerUserId: number;
  ownerEmployeeId: string;
  ownerName: string;
  ownerDepartment: string;
}

export interface AdminDashboardResponse {
  summary: AdminDashboardSummary;
  statusDistribution: Record<DashboardSubmissionStatus, number>;
  processingHours: number[];
  employeePerformance: AdminDashboardEmployeePerformance[];
  submissions: AdminDashboardSubmissionRow[];
}
