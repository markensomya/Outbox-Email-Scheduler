import { Toaster, toast as hotToast } from "react-hot-toast";

/** Wrap react-hot-toast's Toaster in a provider component mounted once at app root. */
export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3500,
        style: {
          borderRadius: "10px",
          background: "#1f2937",
          color: "#fff",
          fontSize: "14px",
        },
        success: { iconTheme: { primary: "#16a34a", secondary: "#fff" } },
        error: { iconTheme: { primary: "#dc2626", secondary: "#fff" } },
      }}
    />
  );
}

/** Thin wrapper that adds success/error convenience methods. */
export const useToast = () => ({
  success: (msg: string) => hotToast.success(msg),
  error: (msg: string) => hotToast.error(msg),
  loading: (msg: string) => hotToast.loading(msg),
  dismiss: hotToast.dismiss,
});
