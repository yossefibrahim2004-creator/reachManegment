
import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useI18n } from "../i18n/context";
import { useSettings } from "../lib/settings";
import { getFriendlyErrorMessage } from "../lib/messages";
import BrandLogo from "../components/BrandLogo";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { brand } = useSettings();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login({ username, password });
      navigate("/");
    } catch (err: unknown) {
      setError(getFriendlyErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "var(--surface)" }}
    >
      <div
        className="w-full max-w-md p-8 rounded-2xl shadow-lg"
        style={{ backgroundColor: "var(--card)" }}
      >
        <div className="text-center mb-8">
          <BrandLogo
            size={56}
            radius={12}
            className="mx-auto mb-4"
            style={{
              backgroundColor: "var(--brand-fill)",
              fontSize: 22,
            }}
          />

          <h1
            className="text-2xl font-bold"
            style={{ color: "var(--ink)" }}
          >
            {brand.businessName || t.appName}
          </h1>

          <p className="text-sm mt-1" style={{ color: "var(--soft)" }}>
            {t.signInTitle}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div
              className="p-3 rounded-lg text-sm"
              style={{
                backgroundColor: "var(--accent-bg)",
                color: "var(--accent)",
              }}
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--ink)" }}
            >
              {t.username}
            </label>

            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="w-full h-11 px-4 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent"
              style={{
                backgroundColor: "var(--bg-inset)",
                borderColor: "var(--border)",
              }}
              placeholder={t.enterUsername}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-1.5"
              style={{ color: "var(--ink)" }}
            >
              {t.password}
            </label>

            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full h-11 px-4 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] focus:border-transparent"
              style={{
                backgroundColor: "var(--bg-inset)",
                borderColor: "var(--border)",
              }}
              placeholder={t.enterPassword}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-lg text-sm font-semibold transition-colors hover:opacity-90 disabled:opacity-50"
            style={{
              backgroundColor: "var(--brand-fill)",
              color: "var(--on-brand)",
            }}
          >
            {loading ? t.signingIn : t.signIn}
          </button>
        </form>
      </div>
    </div>
  );
}

