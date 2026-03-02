"use client";

import { AxiosProgressEvent } from "axios";
import { apiClient } from "./client";
import {
  AdminDashboardResponse,
  AdminChangeRequestListResponse,
  AdminReviewRequest,
  AdminReviewResponse,
  AdminWorkItemDetailResponse,
  AdminWorkItemListResponse,
  CreateWorkItemCommentRequest,
  CreateWorkItemCommentResponse,
  CreateChangeRequestRequest,
  CreateChangeRequestResponse,
  CreateSubmissionResponse,
  CreateWorkItemRequest,
  CreateWorkItemResponse,
  DeleteSubmissionFileResponse,
  FinalizeSubmissionRequest,
  FinalizeSubmissionResponse,
  LoginRequest,
  LoginResponse,
  MarkAllNotificationsReadResponse,
  MarkNotificationReadResponse,
  NotificationListResponse,
  ReplaceSubmissionFileResponse,
  SubmissionStatusResponse,
  UploadResponse,
  ReviewChangeRequestRequest,
  ReviewChangeRequestResponse,
  WorkItemCommentsResponse,
  WorkItemDetailResponse,
  WorkItemSummary,
} from "../types";

interface WorkItemSummaryRow {
  id: number;
  title: string;
  due_date: string;
  status: WorkItemSummary["status"];
  created_at: string;
  updated_at: string;
  latest_submission_version: number;
}

function mapWorkItemRow(row: WorkItemSummaryRow): WorkItemSummary {
  return {
    id: row.id,
    title: row.title,
    dueDate: row.due_date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestSubmissionVersion: row.latest_submission_version,
  };
}

export async function login(input: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>("/api/auth/login", input);
  return response.data;
}

export async function getMyWorkItems(params?: {
  status?: string;
  q?: string;
}): Promise<WorkItemSummary[]> {
  const response = await apiClient.get<{ items: WorkItemSummaryRow[] }>(
    "/api/work-items/me",
    {
      params: {
        status: params?.status || undefined,
        q: params?.q || undefined,
      },
    },
  );
  return response.data.items.map(mapWorkItemRow);
}

export async function createWorkItem(
  input: CreateWorkItemRequest,
): Promise<CreateWorkItemResponse> {
  const response = await apiClient.post<CreateWorkItemResponse>("/api/work-items", input);
  return response.data;
}

export async function getWorkItemDetail(
  workItemId: number,
): Promise<WorkItemDetailResponse> {
  const response = await apiClient.get<WorkItemDetailResponse>(
    `/api/work-items/${workItemId}`,
  );
  return response.data;
}

export async function createSubmission(
  workItemId: number,
  input?: { changeRequestId?: number | null },
): Promise<CreateSubmissionResponse> {
  const response = await apiClient.post<CreateSubmissionResponse>(
    `/api/work-items/${workItemId}/submissions`,
    {
      changeRequestId: input?.changeRequestId ?? undefined,
    },
  );
  return response.data;
}

export async function uploadSubmissionFiles(
  submissionId: number,
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<UploadResponse> {
  const body = new FormData();
  for (const file of files) {
    body.append("files", file);
  }

  const response = await apiClient.post<UploadResponse>(
    `/api/submissions/${submissionId}/files`,
    body,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (event: AxiosProgressEvent) => {
        if (!event.total || !onProgress) {
          return;
        }
        onProgress(Math.round((event.loaded / event.total) * 100));
      },
    },
  );
  return response.data;
}

function extractDownloadFilename(
  contentDisposition: string | undefined,
  fallback: string,
): string {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = contentDisposition.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim();
  }

  return fallback;
}

export async function downloadSubmissionFile(
  submissionId: number,
  fileArtifactId: number,
  fallbackName: string,
): Promise<void> {
  const response = await apiClient.get<Blob>(
    `/api/submissions/${submissionId}/files/${fileArtifactId}/download`,
    {
      responseType: "blob",
    },
  );

  const fileName = extractDownloadFilename(
    response.headers["content-disposition"],
    fallbackName,
  );
  const blobUrl = window.URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export async function replaceSubmissionFile(
  submissionId: number,
  fileArtifactId: number,
  file: File,
): Promise<ReplaceSubmissionFileResponse> {
  const body = new FormData();
  body.append("file", file);

  const response = await apiClient.put<ReplaceSubmissionFileResponse>(
    `/api/submissions/${submissionId}/files/${fileArtifactId}`,
    body,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return response.data;
}

export async function deleteSubmissionFile(
  submissionId: number,
  fileArtifactId: number,
): Promise<DeleteSubmissionFileResponse> {
  const response = await apiClient.delete<DeleteSubmissionFileResponse>(
    `/api/submissions/${submissionId}/files/${fileArtifactId}`,
  );
  return response.data;
}

export async function finalizeSubmission(
  submissionId: number,
  input: FinalizeSubmissionRequest,
): Promise<FinalizeSubmissionResponse> {
  const response = await apiClient.post<FinalizeSubmissionResponse>(
    `/api/submissions/${submissionId}/finalize`,
    input,
  );
  return response.data;
}

export async function getSubmissionStatus(
  submissionId: number,
): Promise<SubmissionStatusResponse> {
  const response = await apiClient.get<SubmissionStatusResponse>(
    `/api/submissions/${submissionId}/status`,
  );
  return response.data;
}

export async function getAdminWorkItems(params?: {
  status?: string;
  q?: string;
  department?: string;
  ownerEmployeeId?: string;
}): Promise<AdminWorkItemListResponse> {
  const response = await apiClient.get<AdminWorkItemListResponse>(
    "/api/admin/work-items",
    {
      params: {
        status: params?.status || undefined,
        q: params?.q || undefined,
        department: params?.department || undefined,
        ownerEmployeeId: params?.ownerEmployeeId || undefined,
      },
    },
  );
  return response.data;
}

export async function getAdminDashboard(params?: {
  fromDate?: string;
  toDate?: string;
  department?: string;
  ownerEmployeeId?: string;
  submissionStatus?: string;
}): Promise<AdminDashboardResponse> {
  const response = await apiClient.get<AdminDashboardResponse>(
    "/api/admin/dashboard",
    {
      params: {
        fromDate: params?.fromDate || undefined,
        toDate: params?.toDate || undefined,
        department: params?.department || undefined,
        ownerEmployeeId: params?.ownerEmployeeId || undefined,
        submissionStatus: params?.submissionStatus || undefined,
      },
    },
  );
  return response.data;
}

export async function getAdminChangeRequests(params?: {
  status?: string;
  requesterEmployeeId?: string;
  fromDate?: string;
  toDate?: string;
  q?: string;
}): Promise<AdminChangeRequestListResponse> {
  const response = await apiClient.get<AdminChangeRequestListResponse>(
    "/api/admin/change-requests",
    {
      params: {
        status: params?.status || undefined,
        requesterEmployeeId: params?.requesterEmployeeId || undefined,
        fromDate: params?.fromDate || undefined,
        toDate: params?.toDate || undefined,
        q: params?.q || undefined,
      },
    },
  );
  return response.data;
}

export async function getAdminWorkItemDetail(
  workItemId: number,
): Promise<AdminWorkItemDetailResponse> {
  const response = await apiClient.get<AdminWorkItemDetailResponse>(
    `/api/admin/work-items/${workItemId}`,
  );
  return response.data;
}

export async function reviewSubmission(
  submissionId: number,
  input: AdminReviewRequest,
): Promise<AdminReviewResponse> {
  const response = await apiClient.post<AdminReviewResponse>(
    `/api/admin/submissions/${submissionId}/review`,
    input,
  );
  return response.data;
}

export async function createChangeRequest(
  workItemId: number,
  input: CreateChangeRequestRequest,
): Promise<CreateChangeRequestResponse> {
  const response = await apiClient.post<CreateChangeRequestResponse>(
    `/api/work-items/${workItemId}/change-requests`,
    input,
  );
  return response.data;
}

export async function reviewChangeRequest(
  changeRequestId: number,
  input: ReviewChangeRequestRequest,
): Promise<ReviewChangeRequestResponse> {
  const response = await apiClient.post<ReviewChangeRequestResponse>(
    `/api/admin/change-requests/${changeRequestId}/review`,
    input,
  );
  return response.data;
}

export async function getNotifications(params?: {
  onlyUnread?: boolean;
  limit?: number;
}): Promise<NotificationListResponse> {
  const response = await apiClient.get<NotificationListResponse>("/api/notifications", {
    params: {
      onlyUnread: params?.onlyUnread ? "1" : undefined,
      limit: params?.limit ?? undefined,
    },
  });
  return response.data;
}

export async function markNotificationRead(
  notificationId: number,
): Promise<MarkNotificationReadResponse> {
  const response = await apiClient.post<MarkNotificationReadResponse>(
    `/api/notifications/${notificationId}/read`,
  );
  return response.data;
}

export async function markAllNotificationsRead(): Promise<MarkAllNotificationsReadResponse> {
  const response = await apiClient.post<MarkAllNotificationsReadResponse>(
    "/api/notifications/read-all",
  );
  return response.data;
}

export async function getWorkItemComments(
  workItemId: number,
  params?: { submissionId?: number },
): Promise<WorkItemCommentsResponse> {
  const response = await apiClient.get<WorkItemCommentsResponse>(
    `/api/work-items/${workItemId}/comments`,
    {
      params: {
        submissionId: params?.submissionId ?? undefined,
      },
    },
  );
  return response.data;
}

export async function createWorkItemComment(
  workItemId: number,
  input: CreateWorkItemCommentRequest,
): Promise<CreateWorkItemCommentResponse> {
  const response = await apiClient.post<CreateWorkItemCommentResponse>(
    `/api/work-items/${workItemId}/comments`,
    input,
  );
  return response.data;
}
