import { translate } from '@/i18n/i18n'
import type { Repo } from '../../../../shared/repo-types'
import { getExecutionHostLabel } from '../../../../shared/execution-host'
import { getProjectGroupCatalogHostIdForRepo } from '@/store/slices/project-group-owner-routing'

export function getProjectGroupMenuHostLabel(
  repo: Pick<Repo, 'connectionId' | 'executionHostId'>,
  hasMultipleCatalogHosts: boolean,
  preferredLabel?: string | null
): string | undefined {
  if (!hasMultipleCatalogHosts) {
    return undefined
  }
  const hostId = getProjectGroupCatalogHostIdForRepo(repo)
  if (hostId === 'local') {
    return translate('auto.components.sidebar.project-group-menu-label.local', 'Local')
  }
  return preferredLabel?.trim() || getExecutionHostLabel(hostId)
}

export function getMoveToGroupMenuLabel(hostLabel?: string | null): string {
  if (!hostLabel) {
    return translate(
      'auto.components.sidebar.project-group-menu-label.moveToGroup',
      'Move to group'
    )
  }
  return translate(
    'auto.components.sidebar.project-group-menu-label.moveToGroupForHost',
    'Move to group: {{hostLabel}}',
    { hostLabel }
  )
}
