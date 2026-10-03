import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../i18n/context";
import { useSettings } from "../../lib/settings";
import { getFriendlyErrorMessage } from "../../lib/messages";
import BrandLogo from "../../components/BrandLogo";

export default function KioskLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login, user } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { brand } = useSettings();

  useEffect(() => {
    if (user?.role === "ATTENDANCE_KIOSK") {
      navigate("/kiosk", { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login({ username, password });
      navigate("/kiosk", { replace: true });
    } catch (err: unknown) {
      setError(getFriendlyErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0B0D12" }}>
      <div className="w-full max-w-md p-8 rounded-2xl shadow-lg" style={{ backgroundColor: "#FFFFFF" }}>
        <div className="text-center mb-8">
          <BrandLogo
            size={56}
            radius={12}
            className="mx-auto mb-4"
            style={{ backgroundColor: "#4169A1", fontSize: 22 }}
          />
          <h1 className="text-2xl font-bold" style={{ color: "#292D38" }}>
            {t.kiosk.title}
          </h1>
          <p className="text-sm mt-1" style={{ color: "#69707D" }}>
            {t.kiosk.loginSubtitle}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>
              {error}
            </div>
          )}

          <div>
            <label htmlFor="kiosk-username" className="block text-sm font-medium mb-1.5" style={{ color: "#292D38" }}>
              {t.username}
            </label>
            <input
              id="kiosk-username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="w-full h-11 px-4 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ backgroundColor: "#F5F3F0" }}
              placeholder={t.enterUsername}
            />
          </div>

          <div>
            <label htmlFor="kiosk-password" className="block text-sm font-medium mb-1.5" style={{ color: "#292D38" }}>
              {t.password}
            </label>
            <input
              id="kiosk-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full h-11 px-4 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ backgroundColor: "#F5F3F0" }}
              placeholder={t.enterPassword}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-lg text-white text-sm font-semibold transition-colors hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#4169A1" }}
          >
            {loading ? t.signingIn : t.signIn}
          </button>
        </form>

        <p className="text-center text-xs mt-6" style={{ color: "#69707D" }}>
          {brand.businessName || t.appName}
        </p>
      </div>
    </div>
  );
}
