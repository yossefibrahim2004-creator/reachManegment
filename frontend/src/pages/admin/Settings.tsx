import { useState, useEffect, useRef } from "react";
import api from "../../lib/api";
import { notify } from "../../lib/notify";
import { getSuccessMessages } from "../../lib/success-messages";
import { PageHeader } from "../../components/ui/PageHeader";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { useI18n } from "../../i18n/context";
import { useSettings, uploadLogo, removeLogo } from "../../lib/settings";
import type { AppSetting } from "../../types";

interface SettingsForm {
  businessName: string;
  address: string;
  phone: string;
  invoicePrefix: string;
}

function formFromSettings(data: AppSetting): SettingsForm {
  return {
    businessName: data.businessName ?? "",
    address: data.address ?? "",
    phone: data.phone ?? "",
    invoicePrefix: data.invoicePrefix ?? "INV",
  };
}

export default function Settings() {
  const { t, language } = useI18n();
  const SUCCESS_MESSAGES = getSuccessMessages(t);
  const { settings, ready, refresh } = useSettings();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seededRef = useRef(false);
  const [form, setForm] = useState<SettingsForm>({
    businessName: "",
    address: "",
    phone: "",
    invoicePrefix: "INV",
  });

  // Seed the form once from the shared context (SettingsProvider already
  // loaded /settings on app boot — no second GET on mount).
  useEffect(() => {
    if (!settings || seededRef.current) return;
    seededRef.current = true;
    setForm(formFromSettings(settings));
  }, [settings]);

  const handleSave = async (section?: string) => {
    setSaving(true);
    setFeedback(null);
    try {
      await api.patch("/settings", form);
      await refresh();
      setFeedback(t.settings.settingsSaved);
      notify.success(SUCCESS_MESSAGES.settings.saved);
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback(t.settings.settingsFailed);
      setTimeout(() => setFeedback(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoFile = async (file: File) => {
    setUploading(true);
    try {
      await uploadLogo(file);
      await refresh();
      notify.success(t.settings.logoUploaded);
    } catch {
      notify.error(t.settings.logoFailed);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    setUploading(true);
    try {
      await removeLogo();
      await refresh();
      notify.success(t.settings.logoRemoved);
    } catch {
      notify.error(t.settings.logoFailed);
    } finally {
      setUploading(false);
    }
  };

  const updateField = (field: keyof SettingsForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (!ready) {
    return (
      <div className="state-block">
        <LoadingSpinner size={28} />
      </div>
    );
  }

  const sectionStyle: React.CSSProperties = { marginBottom: "var(--section-gap)" };
  const labelStyle: React.CSSProperties = {
    fontFamily: "'Sora', sans-serif",
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--ink)",
    margin: "0 0 12px",
  };

  return (
    <div>
      <PageHeader title={t.pages.settings} subtitle={t.pages.settingsSubtitle} />

      {feedback && (
        <div
          style={{
            backgroundColor: feedback === t.settings.settingsFailed ? "var(--accent-bg)" : "var(--mint-bg)",
            color: feedback === t.settings.settingsFailed ? "var(--accent)" : "var(--mint)",
            padding: "12px 16px",
            borderRadius: "8px",
            fontFamily: "'Manrope', sans-serif",
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "var(--section-gap)",
          }}
        >
          {feedback}
        </div>
      )}

      {/* Business Identity */}
      <div style={sectionStyle}>
        <Card>
          <h3 style={labelStyle}>{t.settings.businessIdentity}</h3>
          <div className="form-grid-wide" style={{ gap: "12px" }}>
            <Input label={t.settings.businessName} value={form.businessName} onChange={(e) => updateField("businessName", e.target.value)} />
            <Input label={t.settings.phone} value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
            <div style={{ gridColumn: "1 / -1" }}>
              <Input label={t.settings.address} value={form.address} onChange={(e) => updateField("address", e.target.value)} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontFamily: "'Manrope', sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--soft)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {t.settings.logo}
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                <div
                  style={{
                    width: "72px",
                    height: "72px",
                    borderRadius: "10px",
                    border: "1px dashed var(--border-strong)",
                    backgroundColor: "var(--surface)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  {settings?.logoUrl ? (
                    <img
                      src={settings.logoUrl}
                      alt={t.settings.logo}
                      style={{ width: "100%", height: "100%", objectFit: "contain", padding: "4px" }}
                    />
                  ) : (
                    <span style={{ fontSize: "11px", color: "var(--soft)", textAlign: "center", padding: "0 6px" }}>
                      {t.settings.noLogo}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleLogoFile(file);
                    }}
                  />
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <Button variant="secondary" onClick={() => fileInputRef.current?.click()} loading={uploading}>
                      {t.settings.uploadLogo}
                    </Button>
                    {settings?.logoUrl && (
                      <Button variant="danger" onClick={() => void handleRemoveLogo()} disabled={uploading}>
                        {t.settings.removeLogo}
                      </Button>
                    )}
                  </div>
                  <span style={{ fontSize: "12px", color: "var(--soft)" }}>{t.settings.logoHint}</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={() => handleSave("business")} loading={saving}>{t.settings.saveBusinessInfo}</Button>
          </div>
        </Card>
      </div>

      {/* System Info (read-only) */}
      <div style={sectionStyle}>
        <Card>
          <h3 style={labelStyle}>{t.settings.financial}</h3>
          <div className="form-grid" style={{ gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontFamily: "'Manrope', sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--soft)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {t.settings.currency}
              </label>
              <div style={{ padding: "8px 12px", minHeight: "var(--control-h)", display: "flex", alignItems: "center", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", backgroundColor: "var(--surface)", fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--ink)", boxSizing: "border-box" }}>
                {t.currency} — {language === "ar" ? "جنيه مصري" : "Egyptian Pound"}
              </div>
            </div>
            <div>
              <label style={{ display: "block", fontFamily: "'Manrope', sans-serif", fontSize: "12px", fontWeight: 600, color: "var(--soft)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {t.settings.timezone}
              </label>
              <div style={{ padding: "8px 12px", minHeight: "var(--control-h)", display: "flex", alignItems: "center", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", backgroundColor: "var(--surface)", fontFamily: "'Manrope', sans-serif", fontSize: "14px", color: "var(--ink)", boxSizing: "border-box" }}>
                Africa/Cairo (UTC+2)
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Invoices */}
      <div style={sectionStyle}>
        <Card>
          <h3 style={labelStyle}>{t.settings.invoices}</h3>
          <div style={{ maxWidth: 320 }}>
            <Input label={t.settings.invoicePrefix} value={form.invoicePrefix} onChange={(e) => updateField("invoicePrefix", e.target.value)} placeholder="INV" />
          </div>
          <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={() => handleSave("invoices")} loading={saving}>{t.settings.saveInvoiceSettings}</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
