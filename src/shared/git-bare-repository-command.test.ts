import { describe, expect, it } from 'vitest'
import { explicitBareRepositoryRetryArgs } from './git-bare-repository-command'

describe('explicitBareRepositoryRetryArgs', () => {
  it('retries strict implicit bare-repository failures through the current gitdir', () => {
    const error = Object.assign(new Error('git failed'), {
      stderr: "fatal: cannot use bare repository '/repo.git' (safe.bareRepository is 'explicit')"
    })

    const args = explicitBareRepositoryRetryArgs(['worktree', 'list', '--porcelain'], error)

    expect(args).toEqual(['--git-dir=.', 'worktree', 'list', '--porcelain'])
  })

  it('does not retry unrelated repository failures', () => {
    const error = Object.assign(new Error('git failed'), {
      stderr: 'fatal: not a git repository'
    })

    const args = explicitBareRepositoryRetryArgs(['worktree', 'list'], error)

    expect(args).toBeNull()
  })

  it('does not retry a command that already selected its gitdir', () => {
    const error = Object.assign(new Error('git failed'), {
      stderr: "fatal: cannot use bare repository '/repo.git' (safe.bareRepository is 'explicit')"
    })

    const args = explicitBareRepositoryRetryArgs(['--git-dir=.', 'status'], error)

    expect(args).toBeNull()
  })
})
