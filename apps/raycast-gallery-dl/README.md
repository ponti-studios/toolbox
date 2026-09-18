# raycast-gallery-dl

Raycast extension that downloads Instagram carousels (and any other
`gallery-dl`-supported gallery URL) without touching the terminal. Thin UI over
[gallery-dl](https://codeberg.org/mikf/gallery-dl) — it does the real work.

## Prerequisites

- [Raycast](https://www.raycast.com) for Mac (signed in)
- `gallery-dl` on PATH: `brew install gallery-dl` or `pipx install gallery-dl`
- For Instagram: be logged into `instagram.com` in the browser set in preferences

## Commands

- **Download Instagram Carousel** — form with the post URL (prefilled from the
  clipboard when it holds an Instagram URL), save folder, cookie browser, and a
  photos-only toggle. Raw `yt-dlp` fails on photo-only carousels with
  `No video formats found!`; `gallery-dl` handles them.
- **Download Gallery URL from Clipboard** — no-view command, downloads whatever
  URL is on the clipboard with the preference defaults.

Both finish with a toast showing the photo count and a **Show in Finder** action.

## Preferences

| Preference           | Default                | Notes                                              |
| -------------------- | ---------------------- | -------------------------------------------------- |
| Download Directory   | `~/Downloads/gallery-dl` | Created if missing; `~`/`$VAR` expanded          |
| Cookies Browser      | Chrome                 | Where login cookies are read from                  |
| Cookies File         | (empty)                | Optional `cookies.txt`; overrides the browser      |
| Photos Only          | off                    | Drop downloaded videos, keep images                |
| gallery-dl Binary    | auto-detect            | Checks PATH, `~/.local/bin`, Homebrew, `python3 -m gallery_dl` |

## Develop

```bash
cd apps/raycast-gallery-dl
pnpm install
pnpm dev      # loads the extension into Raycast in development mode
pnpm build    # production bundle check
pnpm lint     # ray lint
pnpm typecheck
```

Only download content you own or have rights to.
