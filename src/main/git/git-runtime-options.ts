import type { GitAdmissionTier } from './command-runner/git-exec-options'
import {
  createExplicitBareRepositoryReadState,
  type ExplicitBareRepositoryReadState
} from '../../shared/git-bare-repository-command'

export type GitRuntimeOptions = {
  wslDistro?: string
  signal?: AbortSignal
  admissionTier?: GitAdmissionTier
}

export type GitExplicitBareRepositoryReadOptions = GitRuntimeOptions & {
  explicitBareRepositoryReadState: ExplicitBareRepositoryReadState
}

export function createGitExplicitBareRepositoryReadOptions(
  options: GitRuntimeOptions
): GitExplicitBareRepositoryReadOptions {
  return { ...options, explicitBareRepositoryReadState: createExplicitBareRepositoryReadState() }
}

export function gitOptionsForWorktree(
  cwd: string,
  options: GitRuntimeOptions = {}
): { cwd: string; wslDistro?: string; signal?: AbortSignal; admissionTier?: GitAdmissionTier } {
  return {
    cwd,
    ...(options.wslDistro ? { wslDistro: options.wslDistro } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.admissionTier ? { admissionTier: options.admissionTier } : {})
  }
}

/**
 * Options for a git invocation that only reads. Opting in explicitly keeps the
 * shell-free WSL route from depending on `wsl-direct-git-read-commands`
 * classifying the argv, which is a heuristic these call sites already know the
 * answer to.
 */
export function gitReadOptionsForWorktree(
  cwd: string,
  options: GitRuntimeOptions = {}
): {
  cwd: string
  wslDistro?: string
  signal?: AbortSignal
  admissionTier?: GitAdmissionTier
  preferWslDirectGit: true
} {
  return { ...gitOptionsForWorktree(cwd, options), preferWslDirectGit: true }
}

export function gitExplicitBareRepositoryReadOptionsForWorktree(
  cwd: string,
  options: GitExplicitBareRepositoryReadOptions
): ReturnType<typeof gitReadOptionsForWorktree> & {
  allowExplicitBareRepositoryRetry: true
  explicitBareRepositoryReadState: ExplicitBareRepositoryReadState
} {
  return {
    ...gitReadOptionsForWorktree(cwd, options),
    allowExplicitBareRepositoryRetry: true,
    explicitBareRepositoryReadState: options.explicitBareRepositoryReadState
  }
}
