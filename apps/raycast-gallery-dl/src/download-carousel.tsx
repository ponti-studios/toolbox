import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Form,
  getPreferenceValues,
  showInFinder,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { dirname } from "node:path";
import { useEffect, useState } from "react";
import {
  Browser,
  debugLogPath,
  downloadGallery,
  expandPath,
  ExtensionPreferences,
  IG_URL_RE,
  resolveGalleryDl,
} from "./lib/gallery-dl";

interface CarouselValues {
  url: string;
  directories: string[];
  browser: Browser;
  photosOnly: boolean;
}

export default function Command() {
  const preferences = getPreferenceValues<ExtensionPreferences>();
  const { push } = useNavigation();
  const [clipboardUrl, setClipboardUrl] = useState("");
  const [urlError, setUrlError] = useState<string | undefined>();

  useEffect(() => {
    Clipboard.readText()
      .then((text) => {
        const candidate = text?.trim() ?? "";
        if (candidate && IG_URL_RE.test(candidate)) setClipboardUrl(candidate);
      })
      .catch(() => undefined);
  }, []);

  async function handleSubmit(values: CarouselValues): Promise<void> {
    const url = values.url.trim();
    if (!IG_URL_RE.test(url)) {
      setUrlError("That doesn't look like an Instagram post, reel, or TV URL.");
      return;
    }
    const outDir = values.directories[0] ?? expandPath(preferences.downloadDir);
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
        outDir,
        browser: values.browser,
        cookiesFile: preferences.cookiesFile,
        photosOnly: values.photosOnly,
      });
      const detail =
        result.videosRemoved > 0
          ? `${result.images.length} photos (${result.videosRemoved} videos dropped)`
          : `${result.images.length} photos`;
      toast.style = Toast.Style.Success;
      toast.title = `Downloaded ${detail}`;
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
      toast.message = "Full error kept open below.";
      await push(
        <Detail
          navigationTitle="Download Failed"
          markdown={`# Download failed\n\n\`\`\`\n${message}\n\`\`\`\n\n## Try\n\n- Re-login at instagram.com in **${values.browser}**, then retry.\n- Export a \`cookies.txt\` (EditThisCookie) and set it in extension preferences with Cookies From set to **None**.\n- Full log: \`${debugLogPath()}\``}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy Error" content={message} />
              <Action.ShowInFinder
                title="Open Debug Log Folder"
                path={dirname(debugLogPath())}
              />
            </ActionPanel>
          }
        />,
      );
    }
  }

  return (
    <Form
      navigationTitle="Download Instagram Carousel"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Download Carousel"
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="url"
        title="Post URL"
        placeholder="https://www.instagram.com/p/…"
        value={clipboardUrl}
        onChange={(value) => {
          setClipboardUrl(value);
          if (urlError) setUrlError(undefined);
        }}
        onBlur={(event) => {
          const value = event.target.value?.trim() ?? "";
          if (value && !IG_URL_RE.test(value)) {
            setUrlError(
              "That doesn't look like an Instagram post, reel, or TV URL.",
            );
          }
        }}
        error={urlError}
        autoFocus
        info="Prefilled from the clipboard when it holds an Instagram post URL."
      />
      <Form.FilePicker
        id="directories"
        title="Save To"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles={false}
        defaultValue={[expandPath(preferences.downloadDir)]}
        info="Defaults to the Download Directory preference. Created if missing."
      />
      <Form.Dropdown
        id="browser"
        title="Cookies From"
        defaultValue={preferences.browser}
      >
        <Form.Dropdown.Item value="chrome" title="Chrome" />
        <Form.Dropdown.Item value="firefox" title="Firefox" />
        <Form.Dropdown.Item value="edge" title="Edge" />
        <Form.Dropdown.Item value="safari" title="Safari" />
        <Form.Dropdown.Item value="brave" title="Brave" />
        <Form.Dropdown.Item value="none" title="None (use cookies file)" />
      </Form.Dropdown>
      <Form.Checkbox
        id="photosOnly"
        title="Media"
        label="Photos only (drop videos)"
        defaultValue={preferences.photosOnly}
      />
    </Form>
  );
}
