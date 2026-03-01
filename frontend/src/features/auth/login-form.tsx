"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api/service";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const auth = useAuth();
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      auth.applyLogin(data);
      router.replace(data.user.role === "ADMIN" ? "/admin" : "/work-items");
      router.refresh();
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate({ employeeId, password });
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">성과관리 시스템 로그인</h1>
        <p className="mt-2 text-sm text-slate-500">
          사번과 비밀번호를 입력해 업무 화면으로 이동하세요.
        </p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">사번</label>
          <input
            className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-cyan-700"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            placeholder="예: emp001"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">비밀번호</label>
          <input
            className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-cyan-700"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호"
            required
          />
        </div>
        {mutation.isError ? (
          <p className="text-sm font-medium text-rose-700">{mutation.error.message}</p>
        ) : null}
        <Button
          className="w-full"
          disabled={mutation.isPending || !employeeId.trim() || !password.trim()}
          type="submit"
        >
          {mutation.isPending ? "로그인 중..." : "로그인"}
        </Button>
      </form>
    </div>
  );
}
