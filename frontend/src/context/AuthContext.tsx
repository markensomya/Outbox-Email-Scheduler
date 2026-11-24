import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api, type User, type SlackStatus } from "../api/client";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  slackStatus: SlackStatus | null;
  refreshSlackStatus: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.auth.me();
        setUser(data.user);
        const slack = await api.slack.status();
        setSlackStatus(slack);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const refreshSlackStatus = async () => {
    const slack = await api.slack.status();
    setSlackStatus(slack);
  };

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
    setSlackStatus(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, slackStatus, refreshSlackStatus, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
