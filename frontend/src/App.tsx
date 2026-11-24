import { useEffect, useState, useCallback } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider, useToast } from "./components/Toast";
import Header from "./components/Header";
import Sidebar, { type TabKey } from "./components/Sidebar";
import ComposeModal from "./components/ComposeModal";
import ScheduledEmails from "./components/ScheduledEmails";
import SentEmails from "./components/SentEmails";
import LoginPage from "./components/LoginPage";
import { api, type EmailCounts } from "./api/client";
import { Loader2 } from "lucide-react";

function Dashboard() {
  const toast = useToast();
  const { loading, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("scheduled");
  const [searchQuery, setSearchQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [counts, setCounts] = useState<EmailCounts | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load badge counts.
  const loadCounts = useCallback(async () => {
    try {
      const data = await api.emails.counts();
      setCounts(data);
    } catch {
      // Silent fail — badges are non-critical.
    }
  }, []);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts, refreshKey]);

  // Check URL params for Slack connection result.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("slack_connected")) {
      toast.success("Slack connected successfully!");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("slack_error")) {
      toast.error("Slack connection failed");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 size={32} className="animate-spin text-brand-600" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const handleComposeScheduled = () => {
    setRefreshKey((k) => k + 1);
    void loadCounts();
  };

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <Header onSearch={setSearchQuery} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          counts={counts}
          onComposeClick={() => setComposeOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl">
            {activeTab === "scheduled" && <ScheduledEmails searchQuery={searchQuery} />}
            {activeTab === "sent" && <SentEmails searchQuery={searchQuery} />}
          </div>
        </main>
      </div>

      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onScheduled={handleComposeScheduled}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider />
      <Dashboard />
    </AuthProvider>
  );
}
