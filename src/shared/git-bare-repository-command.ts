function gitErrorText(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return String(error)
  }
  return ['message', 'stderr']
    .map((field) => (error as Record<string, unknown>)[field])
    .map((value) =>
      typeof value === 'string' ? value : Buffer.isBuffer(value) ? value.toString('utf8') : ''
    )
    .filter(Boolean)
    .join('\n')
}

const GIT_GLOBAL_OPTIONS_WITH_VALUE = new Set([
  '-c',
  '-C',
  '--work-tree',
  '--namespace',
  '--super-prefix',
  '--config-env',
  '--exec-path'
])

function hasExplicitGitDir(args: readonly string[]): boolean {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--git-dir' || arg.startsWith('--git-dir=')) {
      return true
    }
    if (GIT_GLOBAL_OPTIONS_WITH_VALUE.has(arg)) {
      index += 1
      continue
    }
    if (arg.startsWith('-')) {
      continue
    }
    return false
  }
  return false
}

export function explicitBareRepositoryRetryArgs(
  args: readonly string[],
  error: unknown
): string[] | null {
  if (
    hasExplicitGitDir(args) ||
    !/cannot use bare repository[\s\S]*safe\.bareRepository is ['"]explicit['"]/i.test(
      gitErrorText(error)
    )
  ) {
    return null
  }
  return ['--git-dir=.', ...args]
}

export async function runWithExplicitBareRepositoryRetry<T>(
  args: readonly string[],
  run: (commandArgs: string[]) => Promise<T>
): Promise<T> {
  try {
    return await run([...args])
  } catch (error) {
    const retryArgs = explicitBareRepositoryRetryArgs(args, error)
    if (!retryArgs) {
      throw error
    }
    return run(retryArgs)
  }
}
