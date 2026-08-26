import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PullRequestLookupData } from './pull-request-lookup-data'
import { hydrateMissingUnstablePRCheckRollup } from './missing-unstable-pr-check-rollup'

const getPRChecksWithExistingOperationPermitMock = vi.hoisted(() => vi.fn())

vi.mock('./../check/get-pr-checks', () => ({
  getPRChecksWithExistingOperationPermit: getPRChecksWithExistingOperationPermitMock
}))

function createPullRequest(overrides: Partial<PullRequestLookupData> = {}): PullRequestLookupData {
  return {
    number: 42,
    title: 'Manual approval',
    state: 'OPEN',
    url: 'https://github.com/acme/widgets/pull/42',
    statusCheckRollup: [],
    updatedAt: '2026-08-26T10:00:00Z',
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'UNSTABLE',
    headRefOid: 'head-oid',
    ...overrides
  }
}

const lookupArgs = {
  repoPath: '/repo-root',
  dataRepo: { host: 'github.com', owner: 'acme', repo: 'widgets' },
  connectionId: null,
  localGitOptions: {}
}

describe('hydrateMissingUnstablePRCheckRollup', () => {
  beforeEach(() => {
    getPRChecksWithExistingOperationPermitMock.mockReset()
  })

  it('reuses the PR lookup operation permit for the detailed request', async () => {
    getPRChecksWithExistingOperationPermitMock.mockResolvedValue([
      {
        name: 'GitHub Actions',
        status: 'completed',
        conclusion: 'action_required',
        url: null
      }
    ])

    await hydrateMissingUnstablePRCheckRollup(createPullRequest(), lookupArgs)

    expect(getPRChecksWithExistingOperationPermitMock).toHaveBeenCalledWith(
      '/repo-root',
      42,
      'head-oid',
      lookupArgs.dataRepo,
      null,
      {}
    )
  })

  it('loads suite-only checks for an open unstable PR with an empty rollup', async () => {
    const loadChecks = vi.fn().mockResolvedValue([
      {
        name: 'GitHub Actions',
        status: 'completed',
        conclusion: 'action_required',
        url: 'https://github.com/acme/widgets/commit/head-oid/checks'
      }
    ])

    const result = await hydrateMissingUnstablePRCheckRollup(
      createPullRequest(),
      lookupArgs,
      loadChecks
    )

    expect(loadChecks).toHaveBeenCalledOnce()
    expect(result.statusCheckRollup).toEqual([
      expect.objectContaining({ conclusion: 'action_required' })
    ])
  })

  it.each([
    ['a populated rollup', { statusCheckRollup: [{ conclusion: 'failure' }] }],
    ['a stable merge state', { mergeStateStatus: 'CLEAN' }],
    ['a closed PR', { state: 'CLOSED' }]
  ])('does not load detailed checks for %s', async (_label, overrides) => {
    const loadChecks = vi.fn()

    const result = await hydrateMissingUnstablePRCheckRollup(
      createPullRequest(overrides),
      lookupArgs,
      loadChecks
    )

    expect(loadChecks).not.toHaveBeenCalled()
    expect(result).toEqual(createPullRequest(overrides))
  })

  it('keeps the PR summary when detailed checks cannot be loaded', async () => {
    const error = new Error('rate limited')
    const loadChecks = vi.fn().mockRejectedValue(error)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const data = createPullRequest()

    const result = await hydrateMissingUnstablePRCheckRollup(data, lookupArgs, loadChecks)

    expect(result).toBe(data)
    expect(warn).toHaveBeenCalledWith('Unable to hydrate unstable PR checks:', error)
    warn.mockRestore()
  })
})
