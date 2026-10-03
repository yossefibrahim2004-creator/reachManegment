import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";

export interface RealtimeEvent {
  type: string;
  entity?: string;
  entityId?: number;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

const REALTIME_EVENT = "pos:realtime";

export function useRealtimeEvents() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const token = user?.accessToken ?? null;

  useEffect(() => {
    if (!token) return;

    let stopped = false;
    let reconnectTimer: number | undefined;
    let controller: AbortController | undefined;
    let reconnectDelay = 1000;

    const publish = (event: RealtimeEvent) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["stock-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["change-requests"] });
      window.dispatchEvent(new CustomEvent<RealtimeEvent>(REALTIME_EVENT, { detail: event }));
    };

    const parseFrame = (frame: string) => {
      let eventType = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) eventType = line.slice(7).trim();
        if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (eventType === "ready" || !data) return;
      try {
        publish(JSON.parse(data) as RealtimeEvent);
      } catch {
        // Ignore malformed frames; the next successful frame remains authoritative.
      }
    };

    const connect = async () => {
      if (stopped) return;
      controller = new AbortController();
      try {
        const response = await fetch("/api/realtime/events", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error("Realtime connection failed");

        reconnectDelay = 1000;
        window.dispatchEvent(new CustomEvent("pos:realtime-reconnected"));
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          frames.forEach(parseFrame);
        }
      } catch {
        if (!stopped) {
          reconnectTimer = window.setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 10000);
        }
      }
    };

    void connect();
    return () => {
      stopped = true;
      controller?.abort();
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    };
  }, [token, queryClient]);
}

export function useRealtimeRefresh(
  callback: () => void,
  eventTypes?: readonly string[],
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const listener = (event: Event) => {
      const realtimeEvent = (event as CustomEvent<RealtimeEvent>).detail;
      if (!eventTypes || eventTypes.includes(realtimeEvent.type)) {
        callbackRef.current();
      }
    };
    window.addEventListener(REALTIME_EVENT, listener);
    return () => window.removeEventListener(REALTIME_EVENT, listener);
  }, [eventTypes]);
}
