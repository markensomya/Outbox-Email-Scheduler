import { Clock, CheckCircle2, AlertCircle, ExternalLink, RotateCw } from "lucide-react";
import type { EmailRecord } from "../api/client";

interface EmailTableProps {
  emails: EmailRecord[];
  loading: boolean;
  type: "scheduled" | "sent";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { class: string; label: string; icon: React.ReactNode }> = {
    SCHEDULED: { class: "badge-scheduled", label: "SCHEDULED", icon: <Clock size={12} /> },
    RATE_LIMITED_RESCHEDULED: {
      class: "badge-rescheduled",
      label: "RATE_LIMITED",
      icon: <RotateCw size={12} />,
    },
    SENT: { class: "badge-sent", label: "SENT", icon: <CheckCircle2 size={12} /> },
    FAILED: { class: "badge-failed", label: "FAILED", icon: <AlertCircle size={12} /> },
    PROCESSING: {
      class: "bg-purple-100 text-purple-800",
      label: "PROCESSING",
      icon: <Clock size={12} />,
    },
  };
  const c = config[status] || config.SCHEDULED;
  return (
    <span className={`badge gap-1 ${c.class}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

function SkeletonRow({ extraColumn }: { extraColumn: boolean }) {
  return (
    <tr>
      <td className="px-6 py-4">
        <div className="skeleton h-4 w-40" />
      </td>
      <td className="px-6 py-4">
        <div className="skeleton h-4 w-32" />
      </td>
      <td className="px-6 py-4">
        <div className="skeleton h-4 w-28" />
      </td>
      <td className="px-6 py-4">
        <div className="skeleton h-5 w-24 rounded-full" />
      </td>
      {extraColumn && <td className="px-6 py-4"><div className="skeleton h-4 w-20" /></td>}
    </tr>
  );
}

function EmptyState({ type }: { type: "scheduled" | "sent" }) {
  return (
    <tr>
      <td colSpan={type === "sent" ? 5 : 4} className="px-6 py-20">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
            {type === "scheduled" ? <Clock size={36} className="text-brand-300" /> : <CheckCircle2 size={36} className="text-brand-300" />}
          </div>
          <h3 className="mb-1 text-base font-semibold text-gray-700">
            No {type === "scheduled" ? "scheduled" : "sent"} emails yet
          </h3>
          <p className="text-sm text-gray-400">
            {type === "scheduled"
              ? "Compose a new email to see your scheduled campaigns here."
              : "Sent emails will appear here once they've been delivered."}
          </p>
        </div>
      </td>
    </tr>
  );
}

export default function EmailTable({ emails, loading, type }: EmailTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr className="border-b border-gray-200">
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Subject
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              {type === "scheduled" ? "Scheduled Time" : "Sent Time"}
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              Status
            </th>
            {type === "sent" && (
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                Preview
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} extraColumn={type === "sent"} />)
            : emails.length === 0
              ? <EmptyState type={type} />
              : emails.map((email) => (
                  <tr key={email.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{email.recipientEmail}</span>
                        <span className="text-xs text-gray-400">from {email.senderEmail}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-700 line-clamp-1 max-w-xs">{email.subject}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">
                        {type === "scheduled" ? formatDate(email.scheduledAt) : formatDate(email.sentAt)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={email.status} />
                    </td>
                    {type === "sent" && (
                      <td className="px-6 py-4">
                        {email.etherealPreviewUrl ? (
                          <a
                            href={email.etherealPreviewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
                          >
                            View Email
                            <ExternalLink size={14} />
                          </a>
                        ) : email.status === "FAILED" ? (
                          <span className="text-xs text-red-500" title={email.failReason || ""}>
                            {email.failReason?.slice(0, 30) || "Failed"}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
        </tbody>
      </table>
    </div>
  );
}
