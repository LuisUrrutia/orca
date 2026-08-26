import type { GitExplicitBareRepositoryReadOptions } from '../git-runtime-options'
import { gitExplicitBareRepositoryReadOptionsForWorktree } from '../git-runtime-options'
import { gitExecFileAsync } from '../runner'

export async function resolveCompareRef(
  worktreePath: string,
  options: GitExplicitBareRepositoryReadOptions
): Promise<string> {
  try {
    const { stdout } = await gitExecFileAsync(['branch', '--show-current'], {
      ...gitExplicitBareRepositoryReadOptionsForWorktree(worktreePath, options)
    })
    const branch = stdout.trim()
    return branch || 'HEAD'
  } catch {
    return 'HEAD'
  }
}

export async function resolveRefOid(
  worktreePath: string,
  ref: string,
  options: GitExplicitBareRepositoryReadOptions
): Promise<string> {
  const { stdout } = await gitExecFileAsync(['rev-parse', '--verify', '--end-of-options', ref], {
    ...gitExplicitBareRepositoryReadOptionsForWorktree(worktreePath, options)
  })
  return stdout.trim()
}

export async function resolveMergeBase(
  worktreePath: string,
  baseOid: string,
  headOid: string,
  options: GitExplicitBareRepositoryReadOptions
): Promise<string> {
  const { stdout } = await gitExecFileAsync(['merge-base', baseOid, headOid], {
    ...gitExplicitBareRepositoryReadOptionsForWorktree(worktreePath, options)
  })
  return stdout.trim()
}

// Why: `--left-right --count` on the symmetric range answers both directions in one
// rev-list walk; a rebased branch is usually ahead AND behind its base.
export async function countCompareDivergence(
  worktreePath: string,
  baseOid: string,
  headOid: string,
  options: GitExplicitBareRepositoryReadOptions
): Promise<{ ahead: number; behind: number }> {
  const { stdout } = await gitExecFileAsync(
    ['rev-list', '--left-right', '--count', `${baseOid}...${headOid}`],
    { ...gitExplicitBareRepositoryReadOptionsForWorktree(worktreePath, options) }
  )
  const [behind = '', ahead = ''] = stdout.trim().split(/\s+/)
  return {
    ahead: Number.parseInt(ahead, 10) || 0,
    behind: Number.parseInt(behind, 10) || 0
  }
}
