import { Clock, CheckCircle2, Mail, Plus, Activity, ExternalLink } from "lucide-react";
import type { EmailCounts } from "../api/client";
import { API_URL } from "../api/client";

export type TabKey = "scheduled" | "sent";

interface SidebarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  counts: EmailCounts | null;
  onComposeClick: () => void;
}

export default function Sidebar({ activeTab, onTabChange, counts, onComposeClick }: SidebarProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
      {/* Primary CTA */}
      <div className="p-4">
        <button onClick={onComposeClick} className="btn-primary w-full justify-center py-3 shadow-sm">
          <Plus size={18} />
          Compose New Email
        </button>
      </div>

      {/* Navigation tabs */}
      <nav className="flex-1 space-y-1 px-3">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Mailbox
        </p>

        <NavButton
          active={activeTab === "scheduled"}
          onClick={() => onTabChange("scheduled")}
          icon={<Clock size={18} />}
          label="Scheduled Emails"
          count={counts?.scheduled ?? 0}
        />

        <NavButton
          active={activeTab === "sent"}
          onClick={() => onTabChange("sent")}
          icon={<CheckCircle2 size={18} />}
          label="Sent Emails"
          count={counts?.sent ?? 0}
        />
      </nav>

      {/* Footer info */}
      <div className="space-y-2 border-t border-gray-200 p-4">
        <a
          href={`${API_URL}/admin/queues`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-brand-50 p-3 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100"
        >
          <Activity size={16} />
          <span className="flex-1">Live Queue Monitor</span>
          <ExternalLink size={12} />
        </a>
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-3">
          <Mail size={16} className="text-gray-400" />
          <div className="text-xs">
            <p className="font-medium text-gray-700">Ethereal SMTP</p>
            <p className="text-gray-400">Test email delivery</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-brand-50 text-brand-700"
          : "text-gray-600 hover:bg-gray-50"
      }`}
    >
      <span className={active ? "text-brand-600" : "text-gray-400"}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {count > 0 && (
        <span
          className={`badge ${active ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-600"}`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
