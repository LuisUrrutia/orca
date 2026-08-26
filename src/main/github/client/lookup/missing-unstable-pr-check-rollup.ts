import type { PRCheckDetail } from '../../../../shared/github/check-types'
import type { OwnerRepo } from '../../gh-utils'
import { getPRChecksWithExistingOperationPermit } from './../check/get-pr-checks'
import type { HostedReviewLocalGitOptions } from './../github-exec-scope'
import { mapPRState } from '../../mappers'
import type { PullRequestLookupData } from './pull-request-lookup-data'

type DetailedCheckLoader = () => Promise<PRCheckDetail[]>

export async function hydrateMissingUnstablePRCheckRollup(
  data: PullRequestLookupData,
  args: {
    repoPath: string
    dataRepo: OwnerRepo | null
    connectionId?: string | null
    localGitOptions: HostedReviewLocalGitOptions
  },
  loadChecks: DetailedCheckLoader = () =>
    getPRChecksWithExistingOperationPermit(
      args.repoPath,
      data.number,
      data.headRefOid,
      args.dataRepo,
      args.connectionId,
      args.localGitOptions
    )
): Promise<PullRequestLookupData> {
  if (
    data.statusCheckRollup.length > 0 ||
    data.mergeStateStatus?.toUpperCase() !== 'UNSTABLE' ||
    mapPRState(data.state, data.isDraft) !== 'open'
  ) {
    return data
  }

  try {
    const checks = await loadChecks()
    return checks.length > 0 ? { ...data, statusCheckRollup: checks } : data
  } catch (error) {
    // Detailed checks are additive; keep the PR visible when their fallback lookup fails.
    console.warn('Unable to hydrate unstable PR checks:', error)
    return data
  }
}
