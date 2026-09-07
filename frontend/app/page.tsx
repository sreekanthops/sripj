"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import AuthPage from "@/components/AuthPage";

function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace(`/u/${user.username}`);
    }
  }, [user, loading, router]);

  if (loading) return <Spinner />;
  if (user)    return <Spinner />;   // redirecting

  return <AuthPage />;
}

export default function Page() {
  return (
    <AuthProvider>
      <Home />
    </AuthProvider>
  );
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-paper)]">
      <div className="w-8 h-8 border-2 border-[var(--color-paper-3)] border-t-[var(--color-accent)] rounded-full animate-spin" />
    </div>
  );
}
