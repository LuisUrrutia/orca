import { WORKTREE_CATALOG_EVENTS_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'

type RuntimeWorktreeCatalogState = {
  runtimeStatusByEnvironmentId: ReadonlyMap<
    string,
    { status: { capabilities?: readonly string[] } | null }
  >
}

type LegacyRuntimeWorktreeCatalogPollerOptions = {
  getEnvironmentIds: () => readonly string[]
  requestRefresh: (environmentId: string) => void
  intervalMs?: number
}

const LEGACY_RUNTIME_WORKTREE_CATALOG_POLL_INTERVAL_MS = 60_000

export function getLegacyRuntimeWorktreeCatalogEnvironmentIds(
  state: RuntimeWorktreeCatalogState
): string[] {
  const environmentIds: string[] = []
  for (const [environmentId, runtimeStatus] of state.runtimeStatusByEnvironmentId) {
    if (
      runtimeStatus.status &&
      !runtimeStatus.status.capabilities?.includes(WORKTREE_CATALOG_EVENTS_RUNTIME_CAPABILITY)
    ) {
      environmentIds.push(environmentId)
    }
  }
  return environmentIds
}

export function createLegacyRuntimeWorktreeCatalogPoller(
  options: LegacyRuntimeWorktreeCatalogPollerOptions
): { stop: () => void } {
  // COMPAT(worktree-catalog-events): remove after every supported remote server advertises
  // WORKTREE_CATALOG_EVENTS_RUNTIME_CAPABILITY; older hosts never publish external discoveries.
  const timer = setInterval(() => {
    for (const environmentId of new Set(options.getEnvironmentIds())) {
      options.requestRefresh(environmentId)
    }
  }, options.intervalMs ?? LEGACY_RUNTIME_WORKTREE_CATALOG_POLL_INTERVAL_MS)

  return { stop: () => clearInterval(timer) }
}
