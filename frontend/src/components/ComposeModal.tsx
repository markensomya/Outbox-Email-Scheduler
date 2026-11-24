import { useState, useCallback, useRef, useEffect } from "react";
import { X, Upload, Send, Loader2, FileText } from "lucide-react";
import Papa from "papaparse";
import { api, type Sender } from "../api/client";
import { useToast } from "./Toast";

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractEmailsFromContent(content: string): string[] {
  // Works for both CSV (PapaParse output) and raw TXT content.
  const matches = content.match(/[^\s;,]+@[^\s;,]+\.[^\s;,]+/g) || [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    const cleaned = m.trim().replace(/^[<\[]+|[>\].]+$/g, "").toLowerCase();
    if (EMAIL_REGEX.test(cleaned) && !seen.has(cleaned)) {
      seen.add(cleaned);
      result.push(cleaned);
    }
  }
  return result;
}

export default function ComposeModal({ open, onClose, onScheduled }: ComposeModalProps) {
  const toast = useToast();
  const [senders, setSenders] = useState<Sender[]>([]);
  const [senderEmail, setSenderEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [hourlyLimit, setHourlyLimit] = useState(100);
  const [minDelaySeconds, setMinDelaySeconds] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load senders when modal opens.
  const loadSenders = useCallback(async () => {
    try {
      const data = await api.emails.senders();
      setSenders(data.senders);
      if (data.senders.length > 0 && !senderEmail) {
        setSenderEmail(data.senders[0].email);
      }
    } catch {
      toast.error("Failed to load sender accounts");
    }
  }, [toast, senderEmail]);

  // Trigger sender load when the modal opens (before the early return to satisfy Rules of Hooks).
  useEffect(() => {
    if (open && senders.length === 0) {
      void loadSenders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = (event.target?.result as string) || "";
      // Parse with PapaParse (handles CSV), then extract emails from all fields.
      const result = Papa.parse<string[]>(content, { skipEmptyLines: true });
      const flatContent = result.data.flat().join(" ");
      const emails = extractEmailsFromContent(flatContent);
      setRecipients(emails);
      toast.success(`${emails.length} email addresses detected`);
    };
    reader.readAsText(file);
  };

  const handleRemoveFile = () => {
    setRecipients([]);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!senderEmail) {
      toast.error("Please select a sender account");
      return;
    }
    if (!subject.trim()) {
      toast.error("Please enter a subject");
      return;
    }
    if (!body.trim()) {
      toast.error("Please enter email body");
      return;
    }
    if (recipients.length === 0) {
      toast.error("Please upload a file with email recipients");
      return;
    }
    if (!scheduledAt) {
      toast.error("Please select a start time");
      return;
    }

    setSubmitting(true);
    const loadingToast = toast.loading("Scheduling emails...");

    try {
      const result = await api.emails.schedule({
        senderEmail,
        recipients,
        subject,
        body,
        scheduledAt: new Date(scheduledAt).toISOString(),
        hourlyLimit,
        minDelaySeconds,
      });

      toast.dismiss(loadingToast);
      toast.success(`${(result as { created: number }).created} email(s) scheduled successfully`);

      // Reset form
      setSubject("");
      setBody("");
      setRecipients([]);
      setFileName(null);
      setScheduledAt("");
      if (fileInputRef.current) fileInputRef.current.value = "";

      onScheduled();
      onClose();
    } catch (err) {
      toast.dismiss(loadingToast);
      toast.error((err as Error).message || "Failed to schedule emails");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm animate-fade-in">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl animate-slide-up">
        {/* Modal Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">Compose New Email</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Sender selector */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Sender Account</label>
            <select
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              className="input-field"
            >
              {senders.length === 0 && (
                <option value="">No senders configured</option>
              )}
              {senders.map((s) => (
                <option key={s.email} value={s.email}>
                  {s.email}
                </option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter email subject"
              className="input-field"
            />
          </div>

          {/* Body */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email content..."
              rows={5}
              className="input-field resize-y"
            />
          </div>

          {/* CSV / TXT File Upload */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Upload Recipients (CSV / TXT)
            </label>
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-2.5 text-sm text-gray-600 transition-colors hover:border-brand-400 hover:bg-brand-50">
                <Upload size={18} />
                <span>{fileName ? "Replace file" : "Choose file"}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              {fileName && (
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-brand-600" />
                  <span className="text-sm text-gray-600">{fileName}</span>
                  {recipients.length > 0 && (
                    <span className="badge bg-brand-100 text-brand-700">
                      {recipients.length} email addresses detected
                    </span>
                  )}
                  <button onClick={handleRemoveFile} className="text-gray-400 hover:text-red-500">
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Start Time */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Start Time</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="input-field"
            />
          </div>

          {/* Delay between emails & Hourly limit */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Delay Between Emails (seconds)
              </label>
              <input
                type="number"
                min="1"
                value={minDelaySeconds}
                onChange={(e) => setMinDelaySeconds(Number(e.target.value))}
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Hourly Limit (per sender)
              </label>
              <input
                type="number"
                min="1"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
                className="input-field"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4">
          <button onClick={onClose} className="btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button onClick={handleSubmit} className="btn-primary" disabled={submitting}>
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            {submitting ? "Scheduling..." : "Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
