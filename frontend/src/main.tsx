import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { I18nProvider, useI18n } from "./i18n/context";
import { SettingsProvider } from "./lib/settings";
import { ThemeProvider, useTheme } from "./lib/theme";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

function AppToaster() {
  const { dir } = useI18n();
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position={dir === "rtl" ? "top-left" : "top-right"}
      theme={resolvedTheme}
      richColors
      closeButton
      expand
      visibleToasts={5}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <SettingsProvider>
            <App />
            <AppToaster />
          </SettingsProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
