import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { useState } from "react";
import { useRealtimeEvents } from "../hooks/useRealtimeEvents";

export default function Layout() {
  useRealtimeEvents();
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1024
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--surface)" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={sidebarOpen ? "lg:ms-64" : ""}>
        <TopBar
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
          isMenuOpen={sidebarOpen}
        />
        <main className="page-container" style={{ padding: "var(--page-pad-y) var(--page-pad-x)" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
