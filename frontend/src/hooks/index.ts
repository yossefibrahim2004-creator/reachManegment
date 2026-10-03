/**
 * Shared frontend data-fetch hooks.
 *
 * Direction: new/touched list pages should prefer React Query (`useQuery`)
 * which is configured in main.tsx. Pages that remain on raw axios must use
 * `useAbortEffect` + `isAbortError` so unmount/filter changes cancel cleanly.
 * All search/filter inputs must debounce via `useDebouncedValue`.
 */
export { useDebouncedValue } from "./useDebouncedValue";
export { useAbortEffect, runAbortable } from "./useAbortEffect";
export { isAbortError } from "./isAbortError";
export {
  ALL_OPTIONS_LIMIT,
  queryKeys,
  useCategories,
  useSuppliersOptions,
  useEmployeesOptions,
  useWorkplaces,
  useCustomerOptions,
  useProductModelsByCategory,
  useInvoiceById,
  useInvalidateOptions,
} from "./queries";
