import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_ROLE_COOKIE, AUTH_TOKEN_COOKIE } from "@/lib/auth/constants";

export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_TOKEN_COOKIE)?.value;
  const role = cookieStore.get(AUTH_ROLE_COOKIE)?.value;

  if (!token) {
    redirect("/login");
  }
  redirect(role === "ADMIN" ? "/admin" : "/work-items");
}
