"use client";

import { AxiosProgressEvent } from "axios";
import { apiClient } from "./client";
import {
  AdminReviewRequest,
  AdminReviewResponse,
  AdminWorkItemDetailResponse,
  AdminWorkItemListResponse,
  CreateSubmissionResponse,
  CreateWorkItemRequest,
  CreateWorkItemResponse,
  FinalizeSubmissionRequest,
  FinalizeSubmissionResponse,
  LoginRequest,
  LoginResponse,
  SubmissionStatusResponse,
  UploadResponse,
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
): Promise<CreateSubmissionResponse> {
  const response = await apiClient.post<CreateSubmissionResponse>(
    `/api/work-items/${workItemId}/submissions`,
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
