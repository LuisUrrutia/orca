import type { PRCheckDetail } from '../../../../shared/github/check-types'
import type { OwnerRepo } from '../../gh-utils'
import { getPRChecksWithExistingOperationPermit } from './../check/get-pr-checks'
import type { HostedReviewLocalGitOptions } from './../github-exec-scope'
import { deriveCheckStatuses, mapPRState } from '../../mappers'
import type { PullRequestLookupData } from './pull-request-lookup-data'

type DetailedCheckLoader = () => Promise<PRCheckDetail[]>

export async function hydrateUnstablePRCheckRollup(
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
  const rollupStatus = deriveCheckStatuses(data.statusCheckRollup).presentationStatus
  if (
    data.mergeStateStatus?.toUpperCase() !== 'UNSTABLE' ||
    mapPRState(data.state, data.isDraft) !== 'open' ||
    (data.statusCheckRollup.length > 0 && rollupStatus !== 'success')
  ) {
    return data
  }

  const neutralFallback =
    data.statusCheckRollup.length > 0 ? { ...data, statusCheckRollup: [] } : data
  try {
    const checks = await loadChecks()
    return checks.length > 0 ? { ...data, statusCheckRollup: checks } : neutralFallback
  } catch (error) {
    // An unstable passing rollup is incomplete; keep it visible without claiming success.
    console.warn('Unable to hydrate unstable PR checks:', error)
    return neutralFallback
  }
}
