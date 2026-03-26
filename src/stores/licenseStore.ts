import { create } from "zustand";
import { getLicenseStatus, activateLicense, deactivateLicense, refreshLicenseStatus, type LicenseStatus } from "../lib/ipc";
import { open } from "@tauri-apps/plugin-shell";

interface LicenseStore {
  status: LicenseStatus | null;
  loading: boolean;
  error: string | null;
  fetchStatus: () => Promise<void>;
  activate: (key: string) => Promise<boolean>;
  deactivate: () => Promise<void>;
  refresh: () => Promise<void>;
  openPortal: () => Promise<void>;
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
      set({ error: String(e) });
      return false;
    }
  },

  deactivate: async () => {
    try {
      const status = await deactivateLicense();
      set({ status });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  refresh: async () => {
    try {
      const status = await refreshLicenseStatus();
      set({ status, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  openPortal: async () => {
    await open("https://keyforge.dev/portal/request");
  },
}));
