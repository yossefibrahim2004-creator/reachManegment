import { useQuery } from "@tanstack/react-query";
import api from "../../../lib/api";

export interface UseReportDetailsOptions<T> {
  endpoint: string;
  params?: Record<string, string | number | undefined>;
  enabled?: boolean;
  select?: (data: T) => T;
}

export function useReportDetails<T>({
  endpoint,
  params,
  enabled = true,
  select,
}: UseReportDetailsOptions<T>) {
  return useQuery({
    queryKey: ["report-details", endpoint, params ? JSON.stringify(params) : ""],
    enabled: enabled && Boolean(endpoint),
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const response = await api.get<T>(endpoint, { params });
      return response.data;
    },
    select,
  });
}
