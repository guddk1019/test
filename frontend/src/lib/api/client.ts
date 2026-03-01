"use client";

import axios from "axios";
import { getAuthTokenFromBrowser } from "../auth/cookies";

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000",
  timeout: 20_000,
});

apiClient.interceptors.request.use((config) => {
  const token = getAuthTokenFromBrowser();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const apiMessage = error.response?.data?.message;
      const fallback = error.message || "요청 처리 중 오류가 발생했습니다.";
      return Promise.reject(new Error(apiMessage ?? fallback));
    }
    return Promise.reject(new Error("알 수 없는 오류가 발생했습니다."));
  },
);
