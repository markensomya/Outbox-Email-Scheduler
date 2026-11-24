import { Mail } from "lucide-react";
import { API_URL } from "../api/client";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-purple-50">
      <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-xl">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg">
            <Mail size={32} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">Outbox</h1>
            <p className="text-sm text-gray-500">Production-grade Email Scheduler</p>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="space-y-2.5">
          {[
            "BullMQ delayed job scheduling with idempotency",
            "Per-sender hourly rate limiting via Redis",
            "Slack alerts on rate-limit hits",
            "Elasticsearch full-text search",
            "Live Bull Board queue dashboard",
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-2 text-sm text-gray-600">
              <div className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              {feature}
            </div>
          ))}
        </div>

        {/* Google Sign-in */}
        <a
          href={`${API_URL}/api/auth/google`}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </a>

        <p className="text-center text-xs text-gray-400">
          By signing in, you agree to use this service for testing purposes only.
        </p>
      </div>
    </div>
  );
}
