import { mkdir, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runGitFixture } from '../shared/git-process-test-fixture'
import type { GitHandler } from './git-handler'
import type { MockDispatcher } from './git-handler-test-setup'
import {
  createGitHandlerRelay,
  createGitTempDir,
  removeGitTempDir
} from './git-handler-test-harness'

describe('GitHandler strict bare repositories', () => {
  let dispatcher: MockDispatcher
  let handler: GitHandler
  let rootPath: string
  let barePath: string
  let baseOid: string
  let headOid: string

  beforeEach(async () => {
    rootPath = createGitTempDir()
    const sourcePath = path.join(rootPath, 'source')
    barePath = path.join(rootPath, 'repo.git')
    await mkdir(sourcePath)
    await runGitFixture(sourcePath, ['init', '--quiet'])
    await writeFile(path.join(sourcePath, 'file.txt'), 'base\n')
    await runGitFixture(sourcePath, ['add', 'file.txt'])
    await runGitFixture(sourcePath, [
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test User',
      'commit',
      '--quiet',
      '-m',
      'base'
    ])
    baseOid = (await runGitFixture(sourcePath, ['rev-parse', 'HEAD'])).trim()
    await writeFile(path.join(sourcePath, 'file.txt'), 'head\n')
    await runGitFixture(sourcePath, [
      '-c',
      'user.email=test@example.com',
      '-c',
      'user.name=Test User',
      'commit',
      '--quiet',
      '-am',
      'head'
    ])
    headOid = (await runGitFixture(sourcePath, ['rev-parse', 'HEAD'])).trim()
    await runGitFixture(rootPath, ['clone', '--bare', '--quiet', sourcePath, barePath])
    ;({ dispatcher, handler } = createGitHandlerRelay())
    vi.stubEnv('GIT_CONFIG_COUNT', '1')
    vi.stubEnv('GIT_CONFIG_KEY_0', 'safe.bareRepository')
    vi.stubEnv('GIT_CONFIG_VALUE_0', 'explicit')
  })

  afterEach(async () => {
    handler.dispose()
    vi.unstubAllEnvs()
    await removeGitTempDir(rootPath)
  })

  it('does not bypass the policy for generic relay commands', async () => {
    await expect(
      dispatcher.callRequest('git.exec', {
        args: ['rev-parse', '--is-bare-repository'],
        cwd: barePath
      })
    ).rejects.toThrow(/cannot use bare repository/)
  })

  it('reads commit diff blobs through an explicit gitdir retry', async () => {
    const result = await dispatcher.callRequest('git.commitDiff', {
      worktreePath: barePath,
      commitOid: headOid,
      parentOid: baseOid,
      filePath: 'file.txt'
    })

    expect(result).toEqual({
      kind: 'text',
      originalContent: 'base\n',
      modifiedContent: 'head\n',
      originalIsBinary: false,
      modifiedIsBinary: false
    })
  })
})
