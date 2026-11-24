import { useState, useCallback } from "react";
import { Mail, Search, Slack, LogOut, ExternalLink, Activity } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, API_URL } from "../api/client";
import { useToast } from "./Toast";

interface HeaderProps {
  onSearch: (query: string) => void;
}

export default function Header({ onSearch }: HeaderProps) {
  const { user, slackStatus, refreshSlackStatus, logout } = useAuth();
  const toast = useToast();
  const [searchValue, setSearchValue] = useState("");

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchValue(e.target.value);
      onSearch(e.target.value);
    },
    [onSearch],
  );

  const handleSlackConnect = () => {
    window.location.href = api.slack.authUrl();
  };

  const handleSlackDisconnect = async () => {
    try {
      await api.slack.disconnect();
      await refreshSlackStatus();
      toast.success("Slack disconnected");
    } catch {
      toast.error("Failed to disconnect Slack");
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-6 shadow-sm">
      {/* Branding */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Mail size={20} />
        </div>
        <div>
          <h1 className="text-base font-bold text-gray-900">Outbox</h1>
          <p className="text-xs text-gray-500">Email Scheduler</p>
        </div>
      </div>

      {/* Global Search */}
      <div className="relative flex-1 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          value={searchValue}
          onChange={handleSearch}
          placeholder="Search emails by recipient, subject, or content..."
          className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 focus:outline-none"
        />
      </div>

      {/* Queue Monitor Link */}
      <a
        href={`${API_URL}/admin/queues`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
        title="Live Queue Monitor (Bull Board)"
      >
        <Activity size={16} />
        <span className="hidden md:inline">Queue Monitor</span>
        <ExternalLink size={12} />
      </a>

      {/* Slack Connect / Disconnect */}
      {slackStatus?.connected ? (
        <button onClick={handleSlackDisconnect} className="btn-secondary">
          <Slack size={16} className="text-purple-600" />
          <span className="hidden sm:inline">Slack Connected</span>
          <span className="hidden lg:inline text-gray-400 font-normal">(Disconnect)</span>
        </button>
      ) : (
        <button onClick={handleSlackConnect} className="btn-secondary">
          <Slack size={16} className="text-purple-600" />
          <span className="hidden sm:inline">Connect Slack</span>
        </button>
      )}

      {/* User info */}
      <div className="flex items-center gap-3 border-l border-gray-200 pl-4">
        <div className="flex items-center gap-2.5">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="h-9 w-9 rounded-full ring-2 ring-gray-100"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="hidden md:block">
            <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-500">{user?.email}</p>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
