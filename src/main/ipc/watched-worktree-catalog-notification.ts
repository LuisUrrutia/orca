import type { BrowserWindow } from 'electron'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { notifyWorktreesChanged } from './worktree-remote'

type WorktreeCatalogRemoteClientNotifier = Pick<
  OrcaRuntimeService,
  'notifyWorktreeCatalogChangedForRemoteClients'
>

let worktreeCatalogRemoteClientNotifier: WorktreeCatalogRemoteClientNotifier | null = null

export function setWorktreeCatalogRemoteClientNotifier(
  notifier: WorktreeCatalogRemoteClientNotifier
): void {
  worktreeCatalogRemoteClientNotifier = notifier
}

export function notifyWatchedWorktreeCatalogChanged(
  mainWindow: BrowserWindow,
  repoId: string
): void {
  notifyWorktreesChanged(mainWindow, repoId)
  try {
    worktreeCatalogRemoteClientNotifier?.notifyWorktreeCatalogChangedForRemoteClients(repoId)
  } catch (err) {
    // Why: remote fanout must not block the host renderer's own watcher refresh.
    console.error('[worktrees] failed to notify remote clients of watched catalog change', err)
  }
}
