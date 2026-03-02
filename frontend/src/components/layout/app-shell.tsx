"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
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
  { href: "/work-items", label: "내 업무", roles: ["EMPLOYEE", "ADMIN"] },
  { href: "/admin", label: "관리자 제출 큐", roles: ["ADMIN"] },
  { href: "/admin/change-requests", label: "변경요청", roles: ["ADMIN"] },
];

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

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
