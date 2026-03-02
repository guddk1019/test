"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api/service";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  roles: ("EMPLOYEE" | "ADMIN")[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/work-items", label: "업무 목록", roles: ["EMPLOYEE", "ADMIN"] },
  { href: "/admin", label: "관리자 제출 큐", roles: ["ADMIN"] },
  { href: "/admin/change-requests", label: "변경요청", roles: ["ADMIN"] },
];

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const notificationsQuery = useQuery({
    queryKey: ["notifications", "top"],
    queryFn: () => getNotifications({ limit: 15 }),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (notificationId: number) => markNotificationRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!dropdownRef.current) {
        return;
      }
      if (event.target instanceof Node && !dropdownRef.current.contains(event.target)) {
        setIsNotificationOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const notifications = notificationsQuery.data?.items ?? [];

  const handleNotificationClick = async (notification: (typeof notifications)[number]) => {
    if (!notification.isRead) {
      try {
        await markReadMutation.mutateAsync(notification.id);
      } catch {
        // keep navigation behavior even if marking read fails
      }
    }
    setIsNotificationOpen(false);
    if (notification.targetPath) {
      router.push(notification.targetPath);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/60">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-lg font-bold text-cyan-800">
              업무 성과 관리
            </Link>
            <nav className="flex items-center gap-2">
              {NAV_ITEMS.filter((item) =>
                user ? item.roles.includes(user.role) : false,
              ).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium",
                    pathname.startsWith(item.href)
                      ? "bg-cyan-700 text-white"
                      : "text-slate-700 hover:bg-slate-100",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                aria-label="알림"
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setIsNotificationOpen((prev) => !prev)}
              >
                알림
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </button>

              {isNotificationOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-[360px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">알림</div>
                    <button
                      className="text-xs font-semibold text-cyan-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                      type="button"
                      disabled={markAllMutation.isPending || unreadCount === 0}
                      onClick={() => markAllMutation.mutate()}
                    >
                      모두 읽음 처리
                    </button>
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {notificationsQuery.isLoading ? (
                      <div className="px-4 py-6 text-sm text-slate-500">알림을 불러오는 중입니다.</div>
                    ) : notificationsQuery.isError ? (
                      <div className="px-4 py-6 text-sm text-rose-700">
                        {notificationsQuery.error.message}
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-slate-500">새 알림이 없습니다.</div>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {notifications.map((notification) => (
                          <li key={notification.id}>
                            <button
                              type="button"
                              className={cn(
                                "w-full px-4 py-3 text-left hover:bg-slate-50",
                                notification.isRead ? "bg-white" : "bg-cyan-50/50",
                              )}
                              onClick={() => handleNotificationClick(notification)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
                                {!notification.isRead ? (
                                  <span className="mt-1 inline-block h-2 w-2 rounded-full bg-cyan-600" />
                                ) : null}
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs text-slate-600">{notification.message}</p>
                              <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(notification.createdAt)}</p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold text-slate-800">{user?.fullName}</div>
              <div className="text-xs text-slate-500">
                {user?.department} / {user?.employeeId}
              </div>
            </div>
            <Button variant="ghost" onClick={logout}>
              로그아웃
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
