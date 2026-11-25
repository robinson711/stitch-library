// The small Backup menu: one "Back up" button, one "Restore" button and a
// quiet "Last backed up" date. No reminders, no nagging.

import { matchService } from '../match/service';
import { button, buttonRow, errorText, openScreen, working } from '../overlay/screen';
import { h } from '../shared/dom';
import { library as defaultLibrary } from './adapter';
import { backupFileName } from './format';
import type { LibraryPort } from './port';
import { applyRestore, describePlan, prepareRestore } from './restore';
import { readBackup, writeBackup } from './zip';

const LAST_KEY = 'stitch-last-backup';
const EXPLAINED_KEY = 'stitch-backup-explained';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: not important */
  }
}

export function lastBackedUp(): string {
  const v = read(LAST_KEY);
  if (!v) return 'Not backed up yet';
  const d = new Date(v);
  return `Last backed up ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

export interface BackupMenuOptions {
  port?: LibraryPort;
  /** Called after a restore added or changed charts, so the home screen can redraw. */
  onRestored?: () => void;
}

export function openBackupMenu(opts: BackupMenuOptions = {}): void {
  const port = opts.port ?? defaultLibrary;
  const scr = openScreen('Backup', undefined, 'Close');

  function menu(note?: HTMLElement) {
    const firstTime = !read(EXPLAINED_KEY);
    scr.show(
      'Backup',
      note ?? null,
      firstTime
        ? h('div', { class: 'scr-note' },
            h('p', {}, 'Your charts and photos are kept only on this iPhone. Deleting the app, or clearing Safari’s website data, can erase them.'),
            h('p', {}, 'A backup is one file with everything in it. Save it to iCloud Drive and you can bring your library back at any time.'),
          )
        : null,
      buttonRow(button('Back up', backUp, 'primary'), button('Restore from a backup', pickRestore)),
      h('p', { class: 'scr-muted' }, lastBackedUp()),
    );
    if (firstTime) write(EXPLAINED_KEY, '1');
  }

  async function backUp() {
    const w = working('Making your backup…');
    scr.show('Backing up', w.el);
    try {
      const { blob, charts } = await writeBackup(port, (d, t) => w.set(`${d} of ${t} pictures`));
      const name = backupFileName();
      const file = new File([blob], name, { type: 'application/zip' });
      // Sharing must start from a tap, so it gets its own button.
      const save = button('Save backup', async () => {
        if (await share(file)) {
          write(LAST_KEY, new Date().toISOString());
          menu(h('p', { class: 'scr-note', role: 'status' }, 'Backup saved.'));
        }
      }, 'primary');
      scr.show(
        'Your backup is ready',
        h('p', {}, `${charts} ${charts === 1 ? 'chart' : 'charts'} in one file, ${name}.`),
        h('p', {}, 'Tap Save backup, then choose “Save to Files” and pick iCloud Drive.'),
        save,
      );
    } catch (e) {
      menu(errorText((e as Error)?.message || 'The backup could not be made. Your library is unchanged.'));
    }
  }

  /** Share sheet where available (iPhone), otherwise a normal download. */
  async function share(file: File): Promise<boolean> {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file] });
        return true;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return false; // she closed the share sheet
      }
    }
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: file.name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  }

  function pickRestore() {
    const input = h('input', { type: 'file', accept: '.zip,application/zip', class: 'visually-hidden' });
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      input.remove();
      if (f) void check(f);
    });
    document.body.append(input);
    input.click();
  }

  async function check(file: File) {
    scr.show('Checking the backup', working('Checking every chart and picture…').el);
    try {
      const backup = await readBackup(file);
      const plan = await prepareRestore(port, backup);
      if (!plan.charts.length) return menu(h('p', { class: 'scr-note', role: 'status' }, describePlan(plan)));
      scr.show(
        'Restore this backup?',
        h('p', {}, `Backup from ${new Date(backup.library.exportedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}.`),
        h('p', {}, describePlan(plan)),
        buttonRow(
          button('Restore', async () => {
            scr.show('Restoring', working('Adding charts and photos…').el);
            try {
              await applyRestore(port, backup, plan);
              matchService().refresh().catch(() => {}); // rebuild matching data for restored pictures
              opts.onRestored?.();
              menu(h('p', { class: 'scr-note', role: 'status' }, 'Restore finished.'));
            } catch (e) {
              menu(errorText((e as Error)?.message || 'Nothing was restored. Your library is unchanged.'));
            }
          }, 'primary'),
          button('Cancel', () => menu(), 'quiet'),
        ),
      );
    } catch (e) {
      menu(errorText(`${(e as Error)?.message || 'This backup could not be read.'} Your library is unchanged.`));
    }
  }

  menu();
}
