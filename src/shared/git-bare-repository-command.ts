function gitErrorText(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return String(error)
  }
  return ['message', 'stderr']
    .map((field) => (error as Record<string, unknown>)[field])
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
}

function hasExplicitGitDir(args: readonly string[]): boolean {
  return args.some((arg) => arg === '--git-dir' || arg.startsWith('--git-dir='))
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
