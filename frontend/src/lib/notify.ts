import { toast, type ExternalToast } from "sonner";

const defaultOptions: ExternalToast = {
  duration: 4000,
  closeButton: true,
};

export const notify = {
  success: (message: string, options?: ExternalToast) =>
    toast.success(message, { ...defaultOptions, ...options }),
  info: (message: string, options?: ExternalToast) =>
    toast.info(message, { ...defaultOptions, ...options }),
  warning: (message: string, options?: ExternalToast) =>
    toast.warning(message, { ...defaultOptions, duration: 5000, ...options }),
  error: (message: string, options?: ExternalToast) =>
    toast.error(message, { ...defaultOptions, duration: 5000, ...options }),
  dismiss: (toastId?: string | number) => toast.dismiss(toastId),
  dismissAll: () => toast.dismiss(),
};
