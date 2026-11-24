import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api, type EmailRecord } from "../api/client";
import EmailTable from "./EmailTable";

export default function SentEmails({ searchQuery }: { searchQuery: string }) {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<EmailRecord[] | null>(null);

  // Load sent/failed emails.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await api.emails.list("SENT,FAILED");
        if (!cancelled) setEmails(data.emails);
      } catch {
        if (!cancelled) setEmails([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Handle search via Elasticsearch.
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api.emails.search(searchQuery, "SENT");
        const mapped: EmailRecord[] = data.results.map((r) => ({
          id: r.id,
          senderEmail: r.senderEmail,
          recipientEmail: r.recipientEmail,
          subject: r.subject,
          body: r.body,
          status: r.status,
          scheduledAt: r.scheduledAt,
          sentAt: r.sentAt,
          etherealPreviewUrl: null,
          failReason: null,
        }));
        if (!cancelled) setSearchResults(mapped);
      } catch {
        if (!cancelled) setSearchResults([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  const displayEmails = searchResults ?? emails;
  const showLoading = searchQuery.trim() ? false : loading;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={20} className="text-green-600" />
        <h2 className="text-lg font-bold text-gray-900">Sent Emails</h2>
      </div>
      <EmailTable emails={displayEmails} loading={showLoading} type="sent" />
    </div>
  );
}
