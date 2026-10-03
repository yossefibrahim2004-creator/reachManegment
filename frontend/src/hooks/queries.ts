import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { useDebouncedValue } from "./useDebouncedValue";
import type { Category, Customer, PaginatedResponse, ProductModel, Supplier, Workplace } from "../types";

/**
 * Option lists (selects) must never be truncated — a paged default (20/25)
 * silently hides rows from dropdowns. This is effectively "fetch everything";
 * raise only if a dataset outgrows a single request.
 */
export const ALL_OPTIONS_LIMIT = 10_000;

/** Shared query keys — invalidate these after mutations instead of refetching ad-hoc. */
export const queryKeys = {
  categories: ["categories"] as const,
  suppliers: (limit: number) => ["suppliers", "options", limit] as const,
  employees: (limit: number) => ["employees", "options", limit] as const,
  workplaces: ["workplaces"] as const,
  customers: (search: string, limit: number) => ["customers", "options", search, limit] as const,
  productModelsByCategory: (categoryId: string) => ["product-models", "category", categoryId] as const,
  invoiceById: (id: string | number) => ["invoice", id] as const,
};

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: async () => {
      const { data } = await api.get<Category[]>("/categories");
      return Array.isArray(data) ? data : ((data as { data?: Category[] }).data ?? []);
    },
    staleTime: 5 * 60_000,
  });
}

export function useSuppliersOptions(limit = ALL_OPTIONS_LIMIT) {
  return useQuery({
    queryKey: queryKeys.suppliers(limit),
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Supplier>>("/suppliers", {
        params: { page: 1, limit },
      });
      return data.data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useEmployeesOptions(limit = ALL_OPTIONS_LIMIT) {
  return useQuery({
    queryKey: queryKeys.employees(limit),
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<{ id: number; name: string }>>("/employees", {
        params: { page: 1, limit },
      });
      return data.data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useWorkplaces() {
  return useQuery({
    queryKey: queryKeys.workplaces,
    queryFn: async () => {
      const { data } = await api.get<Workplace[]>("/workplaces");
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

/** Debounced server-side customer search (replaces `limit: 1000` client dumps). */
export function useCustomerOptions(search: string, limit = ALL_OPTIONS_LIMIT) {
  const debouncedSearch = useDebouncedValue(search, 300);
  const trimmed = debouncedSearch.trim();

  return useQuery({
    queryKey: queryKeys.customers(trimmed, limit),
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<Customer> | Customer[]>("/customers", {
        params: { page: 1, limit, ...(trimmed ? { search: trimmed } : {}) },
      });
      if (Array.isArray(data)) return data;
      return data.data ?? [];
    },
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useProductModelsByCategory(categoryId: string, limit = ALL_OPTIONS_LIMIT) {
  return useQuery({
    queryKey: queryKeys.productModelsByCategory(categoryId),
    enabled: Boolean(categoryId),
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<ProductModel>>("/product-models", {
        params: { categoryId, page: 1, limit },
      });
      return data.data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

/** Shared invoice-by-id cache so detail pages / navigation don't refetch. */
export function useInvoiceById(id: string | number | undefined) {
  return useQuery({
    queryKey: queryKeys.invoiceById(id ?? ""),
    enabled: id !== undefined && id !== "",
    queryFn: async () => {
      const { data } = await api.get(`/invoices/${id}`);
      return data;
    },
    staleTime: 15_000,
  });
}

/** Invalidate option lists after create/update/delete. */
export function useInvalidateOptions() {
  const queryClient = useQueryClient();
  return {
    categories: () => queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
    suppliers: () => queryClient.invalidateQueries({ queryKey: ["suppliers", "options"] }),
    employees: () => queryClient.invalidateQueries({ queryKey: ["employees", "options"] }),
    workplaces: () => queryClient.invalidateQueries({ queryKey: queryKeys.workplaces }),
    customers: () => queryClient.invalidateQueries({ queryKey: ["customers", "options"] }),
    invoice: (id?: string | number) => {
      if (id !== undefined) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.invoiceById(id) });
      }
      void queryClient.invalidateQueries({ queryKey: ["invoice"] });
    },
  };
}
