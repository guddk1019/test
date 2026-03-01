import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/login-form";
import { AUTH_ROLE_COOKIE, AUTH_TOKEN_COOKIE } from "@/lib/auth/constants";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_TOKEN_COOKIE)?.value;
  const role = cookieStore.get(AUTH_ROLE_COOKIE)?.value;

  if (token) {
    redirect(role === "ADMIN" ? "/admin" : "/work-items");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <LoginForm />
    </div>
  );
}
