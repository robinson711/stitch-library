# Stitch Library — project context

Paste this whole file into a Claude Project's instructions, or upload it as a
project file. It holds everything decided so far, so a new conversation can
continue without the original chat.

---

## 1. Role and goal

Act as a senior web developer. Build **Stitch Library**, an installable web app
(PWA) hosted on GitHub Pages and used from an iPhone 17 Pro Home Screen
(iOS 26 or 27). It is for one person who does cross stitch, needlepoint and
quilting, and who gets overwhelmed by technology. It must feel calm, helpful
and obvious.

## 2. Constraints (unchanged from the original brief)

- Static files only (TypeScript and a simple build). No server, database
  service, accounts, analytics, ads, paid services or AI agent.
- All processing happens in the browser. Photos, charts and text never leave
  the phone.
- Self-host every script, font, model and language file. No third-party
  requests at runtime; enforce this with a Content Security Policy.
- Store data in IndexedDB. Request persistent storage, handle refusal, and
  handle a full quota without losing data.
- Text reading: Tesseract.js. PDFs: PDF.js. Matching: a small image embedding
  model run in the browser (Transformers.js). Load heavy parts only when
  needed and show a plain "Working" message.
- No goals, counts, streaks, progress bars about her activity, statistics,
  ratings or notifications.
- Charts may be copyrighted: no sharing or publishing features.

## 3. Design

- Home: grid of chart cover pictures, one search box, a large Add button, a
  large "I finished one" button, and a small Backup menu.
- Few screens, large touch targets, plain words, chartreuse accent with dark
  readable text on it.
- Respect safe areas, text size, screen readers, and light and dark mode.
- Typing is needed only to correct something.
- First visit shows short steps: Safari, Share, Add to Home Screen. Warn her
  to add charts only in the Home Screen app, because its storage is separate
  from Safari.

## 4. Features

1. Add a chart from the camera, photo library or PDF. Simple cropping and
   rotation. Craft: cross stitch, needlepoint or quilt (optional).
2. Read all text on the cover and pages. Store it for search. Suggest a title
   and designer on a review screen, let her edit, save only when she taps Save.
3. Chart page: cover, title, designer, source pages or PDF, notes, and many
   project photos, each marked progress or finished with an optional note.
   Full-screen viewing. Edit and delete, with confirmation before deleting.
4. "I finished one": she takes or picks a photo. Show "Is this the chart?" with
   the best match's cover beside her photo. Yes attaches it as a finished
   photo. No shows two more choices, a search box and "Add a new chart". Never
   attach anything without her confirmation. Cancel is always available.
5. Matching: compare the photo with each chart's cover and confirmed photos and
   rank by closest distance. If nothing is close or matching fails, offer
   search.
6. Search titles, designers, notes and recognized text, ignoring case and
   accents.
7. One Back up button (iOS share sheet so she can save to iCloud Drive,
   download as fallback) and one Restore button. A quiet "Last backed up" date,
   no nagging. Explain once, plainly, that deleting the app or clearing website
   data can erase the library.
8. Works fully offline after setup, including text reading and matching.
   Updates must never erase data; migrate the database safely.

## 5. Backup format (shared with an iPhone version — follow exactly)

- File `StitchLibrary-YYYY-MM-DD.zip` containing `library.json` (UTF-8) and a
  `files/` folder.
- `{"format":"stitch-library","version":1,"exportedAt":DATE,"charts":[{"id":UUID,"title":"","designer":"","craft":"cross-stitch"|"needlepoint"|"quilt"|"","recognizedText":"","notes":"","createdAt":DATE,"updatedAt":DATE,"cover":"files/UUID.jpg","source":["files/UUID.pdf"],"photos":[{"id":UUID,"file":"files/UUID.jpg","kind":"progress"|"finished","notes":"","createdAt":DATE}]}]}`
- UUIDs lowercase. DATE is UTC as `YYYY-MM-DDTHH:MM:SSZ`, no fractional
  seconds. Images are JPEG (convert HEIC). `source` holds JPEG or PDF paths.
- Any change to a chart or its photos updates `updatedAt`.
- Restore merges by id: add missing charts and photos, keep chart text from the
  newer `updatedAt`, never delete existing items. Validate the whole file
  (including unsafe paths) before writing, show a confirmation, and leave the
  library unchanged on failure.
- Do not store image embeddings in the backup; rebuild them after restore.

## 6. GitHub rules

- Public repository named **`stitch-library`**, GitHub Pages on the free plan,
  deployed by GitHub Actions over HTTPS. Paths must work under
  `/stitch-library/`. Address: `https://<github-username>.github.io/stitch-library/`
  — keep it stable forever, because saved data is tied to it.
- Include the web manifest, icons and service worker.
- Never commit her photos, charts, backups or secrets. `.gitignore` rules and a
  pre-commit check (`scripts/check-staged.sh`, enabled with
  `git config core.hooksPath .githooks`) enforce this.
- Ask before creating the repository, pushing or publishing.

## 7. Phases (stop after each and report)

1. **Matching and text test on iPhone Safari** with 10–20 real pairs of chart
   covers and finished pieces (kept out of git). Report how often the right
   chart is first and in the top three, text accuracy, speed and download
   size. Recommend whether to continue. ← **current phase**
2. Library, add chart, text reading, search.
3. Project photos and "I finished one".
4. Backup, restore, offline, accessibility, publish.

Quality: handle denied camera access, large photos and PDFs, memory limits and
interrupted saves. Tests for search, match ranking, backup round trip, merge,
bad files and database upgrades. Build and test before calling a phase done,
and say what must be checked on a real iPhone.

Handoff: a plain-language README covering publish, install on the Home Screen,
update, back up, restore, move to or from the iPhone app, and known limits.

## 8. Decisions already made

| Topic | Decision |
|---|---|
| Build | Vite 8.3.8 + TypeScript 7.0.2, no UI framework yet (small `h()` DOM helper). Tests: Vitest 5.1.2. |
| Node | Node 24.22.3 LTS, installed in `~/.local/node` (not system-wide). Run commands with `export PATH=~/.local/node/bin:$PATH`. |
| Matching model | DINOv2-small (Meta, Apache-2.0), ONNX export `Xenova/dinov2-small`, pinned revision `c2bb04a51fab207c420665f1946016107bffc701`. Two sizes under test: `q8` (24.5 MB) and `q4f16` (12.9 MB). MobileCLIP rejected (Apple sample-code license). |
| Matching runtime | Transformers.js **4.3.2** (v4 is stable now) with ONNX Runtime Web asyncify build (works with WebGPU and WebAssembly). Single thread (GitHub Pages cannot enable cross-origin isolation). `env.allowRemoteModels = false`. |
| Matching method | Model input built manually (no center-crop processor): three 224×224 views per picture — whole (padded), center square, middle 70%. Score per chart = best cosine similarity across all views and all of the chart's vectors. Pooling (CLS vs. patch average) and score threshold to be chosen from Phase 1 data. |
| Text reading | Tesseract.js 7.0.0, LSTM-only cores, English `best_int` data (2.8 MB), all self-hosted. "Sparse text" layout was ~6× faster than "auto" in the desktop check. Low-confidence noise lines must be filtered before storing text for search. |
| Title/designer suggestion | Rules in `src/ocr/suggest.ts`: biggest text = title (joins two same-size lines), line with "by / designed by / © / designs / studio" = designer, product words (cross stitch, chart, 14 count…) ignored. |
| Libraries for later phases | PDF.js (`pdfjs-dist` 6.x, Apache-2.0), `idb` (ISC), `fflate` for zip (MIT). |
| Security policy | `<meta>` CSP added at build time: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self' blob: data:; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`. No inline styles or scripts in HTML. |
| Runtime files | `npm run assets` copies library files from `node_modules` into `public/ocr`, `public/ort` and downloads model files into `public/models` with SHA-256 checks. These folders are git-ignored; CI must run `npm run assets` before building. |
| Phase 1 testing | Served over home Wi-Fi from the Mac (`vite preview --host`), not GitHub Pages. Plain http means no WebGPU on the iPhone, so speed is the slower processor path; accuracy results are still valid. |

## 9. Status (as of 2026-11-25)

- Done: project set up, test bench page (`lab.html`), matching + text reading
  pipeline, 16 unit tests passing, production build working, privacy check on
  staged files working. Nothing committed to git yet; no GitHub repository yet.
- Desktop check with 4 made-up pairs: right chart first 4/4 (3-view methods),
  titles 4/4, designers 3/4, matching ~1 s per photo with WebGPU, text reading
  ~1.2 s per cover (sparse). Not meaningful for real accuracy.
- Waiting for: the user to run the test bench on the iPhone with 10–20 real
  pairs (once with "Standard", once with "Small" model) and paste back the
  numbers-only reports. Then write the Phase 1 report and recommendation.

## 10. File map

```
index.html                 placeholder home page (real app comes in Phase 2)
lab.html                   Phase 1 test bench page
vite.config.ts             build settings, CSP, drops duplicate ORT wasm
scripts/fetch-assets.mjs   copies/downloads runtime files, checks hashes
scripts/report-size.mjs    writes dist/asset-sizes.json (download size)
scripts/check-staged.sh    pre-commit privacy check (.githooks/pre-commit)
src/shared/text.ts         case/accent folding, edit distance, similarity
src/shared/dom.ts          tiny safe DOM helper
src/shared/base.css        colours (chartreuse), light/dark, safe areas
src/image/load.ts          photo/HEIC -> size-capped canvas, JPEG export
src/match/views.ts         224×224 views and model input tensor
src/match/embed.worker.ts  DINOv2 in a background worker
src/match/embedder.ts      main-thread side of the worker
src/match/rank.ts          ranking, rank position, confidence
src/ocr/ocr.ts             Tesseract wrapper, line extraction
src/ocr/suggest.ts         title/designer suggestion rules
src/ocr/accuracy.ts        scores text reading against typed answers
src/lab/main.ts, lab.css   test bench screen
tests/*.test.ts            unit tests (text, suggestion, ranking)
```

Commands: `npm run assets`, `npm test`, `npm run build`, `npm run preview`.
