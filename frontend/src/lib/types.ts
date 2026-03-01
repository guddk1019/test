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
