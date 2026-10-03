import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import api from "./api";
import { notify } from "./notify";
import { getSuccessMessages } from "./success-messages";
import { useI18n } from "../i18n/context";
import type { AuthUser, LoginRequest, LoginResponse, Role } from "../types";

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    if (!value) return fallback;
    return JSON.parse(value) as T;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  hasRole: (role: Role) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => safeReadJson<AuthUser | null>("user", null));
  const { t } = useI18n();
  const SUCCESS_MESSAGES = getSuccessMessages(t);

  const isAuthenticated = !!user?.accessToken;

  const login = useCallback(async (credentials: LoginRequest) => {
    const { data } = await api.post<LoginResponse>("/auth/login", credentials);
    const employee = data.employee ?? { id: 0, name: "", username: "", role: "ADMIN" as Role };
    const [firstName, ...rest] = (employee.name ?? "").trim().split(/\s+/);
    const lastName = rest.join(" ");
    const authUser: AuthUser = {
      id: employee.id,
      firstName: employee.firstName ?? firstName ?? "",
      lastName: employee.lastName ?? lastName ?? "",
      username: employee.username,
      role: employee.role,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      workplaceId: employee.workplaceId ?? null,
    };
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    localStorage.setItem("user", JSON.stringify(authUser));
    setUser(authUser);
    notify.success(SUCCESS_MESSAGES.auth.login);
  }, [SUCCESS_MESSAGES]);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore logout errors
    } finally {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      setUser(null);
      notify.success(SUCCESS_MESSAGES.auth.logout);
    }
  }, [SUCCESS_MESSAGES]);

  const refreshToken = useCallback(async () => {
    const storedRefreshToken = localStorage.getItem("refreshToken");
    if (!storedRefreshToken) {
      throw new Error("No refresh token available");
    }
    const currentUser = safeReadJson<AuthUser | null>("user", null);
    const { data } = await api.post<LoginResponse>("/auth/refresh", {
      employeeId: currentUser?.id,
      refreshToken: storedRefreshToken,
    });
    const employee = data.employee ?? { id: 0, name: "", username: "", role: "ADMIN" as Role };
    const [firstName, ...rest] = (employee.name ?? "").trim().split(/\s+/);
    const lastName = rest.join(" ");
    const authUser: AuthUser = {
      id: employee.id,
      firstName: employee.firstName ?? firstName ?? "",
      lastName: employee.lastName ?? lastName ?? "",
      username: employee.username,
      role: employee.role,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      workplaceId: employee.workplaceId ?? null,
    };
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    localStorage.setItem("user", JSON.stringify(authUser));
    setUser(authUser);
    notify.success(SUCCESS_MESSAGES.auth.sessionRefreshed);
  }, [SUCCESS_MESSAGES]);

  const hasRole = useCallback(
    (role: Role) => user?.role === role,
    [user?.role]
  );

  useEffect(() => {
    if (user) {
      localStorage.setItem("user", JSON.stringify(user));
    }
  }, [user]);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated, login, logout, refreshToken, hasRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
