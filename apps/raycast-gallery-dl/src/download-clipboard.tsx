import {
  Clipboard,
  getPreferenceValues,
  showHUD,
  showInFinder,
  showToast,
  Toast,
} from "@raycast/api";
import {
  downloadGallery,
  debugLogPath,
  ExtensionPreferences,
  firstUrl,
  resolveGalleryDl,
} from "./lib/gallery-dl";

/** No-view command: download the gallery URL on the clipboard with default settings. */
export default async function Command() {
  const preferences = getPreferenceValues<ExtensionPreferences>();
  const text = (await Clipboard.readText())?.trim() ?? "";
  const url = firstUrl(text);

  if (!url) {
    await showHUD("Clipboard has no URL");
    return;
  }

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Downloading…",
    message: url,
  });
  try {
    const binary = await resolveGalleryDl(
      preferences.galleryDlPath || undefined,
    );
    const result = await downloadGallery(binary, {
      url,
      outDir: preferences.downloadDir,
      browser: preferences.browser,
      cookiesFile: preferences.cookiesFile,
      photosOnly: preferences.photosOnly,
    });
    toast.style = Toast.Style.Success;
    toast.title = `Downloaded ${result.images.length} photo(s)`;
    toast.message = result.outDir;
    toast.primaryAction = {
      title: "Show in Finder",
      onAction: (current) => {
        void showInFinder(result.outDir);
        current.hide();
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast.style = Toast.Style.Failure;
    toast.title = "Download failed";
    toast.message = `${message}\nFull log: ${debugLogPath()}`;
  }
}
