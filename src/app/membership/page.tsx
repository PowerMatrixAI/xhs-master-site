import Link from "next/link";
import { AuthGuard } from "@/app/components/AuthGuard";
import { MembershipPanel } from "@/app/components/MembershipPanel";

export default function MembershipPage() {
  return <AuthGuard><main className="mx-auto min-h-screen max-w-7xl px-4 py-8 lg:px-8"><Link href="/" className="secondary-button mb-5">返回控制台</Link><MembershipPanel /></main></AuthGuard>;
}