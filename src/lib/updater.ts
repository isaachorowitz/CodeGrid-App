import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateReadyCallback = (
  version: string,
  install: () => Promise<void>
) => void;

export async function checkForUpdatesInBackground(
  onUpdateReady: UpdateReadyCallback
): Promise<void> {
  try {
    const update = await check();
    if (!update) return;

    await update.download((event: DownloadEvent) => {
      if (event.event === "Finished") {
        console.log("Update download complete");
      }
    });

    onUpdateReady(update.version, async () => {
      await update.install();
      await relaunch();
    });
  } catch (err) {
    console.error("Update check failed:", err);
  }
}

