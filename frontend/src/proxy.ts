import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const session = request.cookies.get("t4m_session")?.value;
  if (!session) return NextResponse.redirect(new URL("/", request.url));
  const backend = process.env.INTERNAL_API_URL ?? "http://localhost:8000";
  try {
    const response = await fetch(`${backend}/api/v1/auth/session`, {
      headers: { Cookie: `t4m_session=${session}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) return NextResponse.next();
  } catch { /* Fail closed; login can display backend availability errors. */ }
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/dashboard/:path*", "/zones/:path*", "/predictions/:path*", "/leanfarming/:path*", "/animals/:path*", "/quality/:path*", "/alerts/:path*", "/tasks/:path*", "/management/:path*", "/settings/:path*", "/orders/:path*", "/shifts/:path*", "/incidents/:path*", "/handover/:path*", "/profile/:path*", "/audit-log/:path*", "/integration/:path*", "/report/:path*", "/tv/:path*"],
};
