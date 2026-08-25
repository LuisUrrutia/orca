import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WORKTREE_CATALOG_EVENTS_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import {
  createLegacyRuntimeWorktreeCatalogPoller,
  getLegacyRuntimeWorktreeCatalogEnvironmentIds
} from './legacy-runtime-worktree-catalog-poller'

describe('legacy runtime worktree catalog polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refreshes reachable hosts without catalog events until they advertise support', async () => {
    let runtimeStatusByEnvironmentId = new Map([
      [
        'legacy',
        {
          status: { runtimeId: 'legacy-runtime', capabilities: [] },
          checkedAt: 1
        }
      ],
      [
        'current',
        {
          status: {
            runtimeId: 'current-runtime',
            capabilities: [WORKTREE_CATALOG_EVENTS_RUNTIME_CAPABILITY]
          },
          checkedAt: 1
        }
      ],
      ['offline', { status: null, checkedAt: 1 }]
    ])
    const requestRefresh = vi.fn()
    const poller = createLegacyRuntimeWorktreeCatalogPoller({
      getEnvironmentIds: () =>
        getLegacyRuntimeWorktreeCatalogEnvironmentIds({ runtimeStatusByEnvironmentId }),
      requestRefresh,
      intervalMs: 60_000
    })

    await vi.advanceTimersByTimeAsync(59_999)
    expect(requestRefresh).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(requestRefresh).toHaveBeenCalledTimes(1)
    expect(requestRefresh).toHaveBeenCalledWith('legacy')

    runtimeStatusByEnvironmentId = new Map(runtimeStatusByEnvironmentId).set('legacy', {
      status: {
        runtimeId: 'legacy-runtime',
        capabilities: [WORKTREE_CATALOG_EVENTS_RUNTIME_CAPABILITY]
      },
      checkedAt: 2
    })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(requestRefresh).toHaveBeenCalledTimes(1)

    poller.stop()
  })
})
