import { create } from "zustand";
import { getLicenseStatus, activateLicense, deactivateLicense, type LicenseStatus } from "../lib/ipc";

interface LicenseStore {
  status: LicenseStatus | null;
  loading: boolean;
  error: string | null;
  fetchStatus: () => Promise<void>;
  activate: (key: string) => Promise<boolean>;
  deactivate: () => Promise<void>;
}

export const useLicenseStore = create<LicenseStore>((set) => ({
  status: null,
  loading: true,
  error: null,

  fetchStatus: async () => {
    try {
      const status = await getLicenseStatus();
      set({ status, loading: false, error: null });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  activate: async (key: string) => {
    try {
      set({ error: null });
      const status = await activateLicense(key);
      set({ status });
      return true;
    } catch (e) {
      set({ error: "Invalid license key" });
      return false;
    }
  },

  deactivate: async () => {
    const status = await deactivateLicense();
    set({ status });
  },
}));
