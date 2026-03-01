import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
  }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatHours(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }
  return `${value.toFixed(1)}h`;
}

export function formatBytes(value: number | null | undefined): string {
  if (!value || Number.isNaN(value)) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const fixed = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(fixed)} ${units[unitIndex]}`;
}

export function shortHash(hash: string): string {
  if (!hash || hash.length < 12) {
    return hash;
  }
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
}
