# Stitch Library

A calm, private library of cross stitch, needlepoint and quilting charts for
the iPhone. Everything stays on the phone: photos, charts and the words read
from them never leave it. There are no accounts, ads or tracking.

---

## Publish it (one time)

The app lives on GitHub Pages at `https://robinson711.github.io/stitch-library/`.
**Keep this address forever.** The phone ties its saved library to the address,
so a new address would start an empty library.

1. GitHub Pages on the free plan needs the repository to be **public**. Her
   photos and charts are never in the repository (a check blocks them), so
   making it public shares only the app's code.
   Repository → **Settings** → **General** → bottom of the page → **Change
   visibility** → **Public**.
2. Repository → **Settings** → **Pages** → under **Source** choose
   **GitHub Actions**.
3. Repository → **Actions** → **Publish to GitHub Pages** → **Run workflow**.
   After about five minutes the app is live at the address above.

## Put it on her iPhone

1. Open the address in **Safari**.
2. Tap the **Share** button (a square with an arrow pointing up).
3. Tap **Add to Home Screen**, then **Add**.
4. Open **Stitches** from the Home Screen and use it only from there.

Safari and the Home Screen app keep **separate** libraries. Charts added in
Safari won't appear in the Home Screen app.

The first time the Home Screen app opens with internet, it quietly downloads
about 65 MB (the text reader and the picture matcher) so it can work with no
internet afterwards.

## Updates

Publish again (step 3 above). The app picks up the new version by itself the
next time she leaves it and comes back. Updates never erase her library.

## Back up

Home screen → **Backup** → **Back up** → **Save backup** → **Save to Files** →
**iCloud Drive**. The file is called `StitchLibrary-YEAR-MONTH-DAY.zip` and
holds every chart, page, PDF and photo. The Backup menu shows the date of the
last backup.

**Deleting the app, or clearing Safari's website data, erases the library.**
A recent backup is the only way to get it back.

## Restore

Home screen → **Backup** → **Restore from a backup** → pick the `.zip` file.
The app checks the whole file first, says what it will add, and only changes
anything after she taps **Restore**. Restoring never deletes: it adds charts
and photos that are missing and keeps the newer title, designer and notes of
each chart. If anything goes wrong, the library stays exactly as it was.

## Move to or from the iPhone app version

Both versions use the same backup file. Make a backup in one, then restore it
in the other.

## Known limits

- The matching ("I finished one") gets faster after it has been used once,
  because the phone prepares each chart in the background. Right after a
  restore of many charts, the first match can take a while.
- Matching is a suggestion. It never attaches a photo until she says yes.
- Text reading works best on clear, flat, well-lit covers.
- Storage is limited by the iPhone's free space. If the phone is full, saving
  stops with a plain message and nothing is lost.
- Sharing and publishing charts is deliberately not possible (charts may be
  copyrighted).

---

## For developers

Requires Node 24.

```sh
npm ci            # install
npm run assets    # copy/download runtime files (text reader, model) with hash checks
npm test          # unit tests
npm run build     # type check, build to dist/, write the offline file list (sw.js)
npm run preview   # serve dist/ on the local network
npm run icons     # redraw the app icons in public/icons/
```

Never commit photos, charts, backups or secrets. Turn on the check with
`git config core.hooksPath .githooks`. Full decisions and the file map are in
`PROJECT_CONTEXT.md`.
