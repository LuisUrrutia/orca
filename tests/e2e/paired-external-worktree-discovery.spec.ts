import { rmSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { gitExecFileAsync } from '../../src/main/git/runner'
import { expect, test } from './helpers/orca-app'
import {
  createRuntimeDesktopPairingOffer,
  launchPairedElectronClient,
  type PairedElectronClient
} from './helpers/paired-electron-client'
import { worktreeRow } from './worktree-row-locators'

function normalizeTestPath(value: string): string {
  const normalized = path.normalize(value)
  if (process.platform === 'darwin' && normalized.startsWith('/private/var/')) {
    return normalized.slice('/private'.length)
  }
  return normalized
}

function pathsMatch(left: string, right: string): boolean {
  return normalizeTestPath(left) === normalizeTestPath(right)
}

async function findWorktreeId(page: Page, repoId: string, worktreePath: string): Promise<string> {
  const candidates = await page.evaluate(
    (expectedRepoId) =>
      window.__store
        ?.getState()
        .allWorktrees()
        .filter((worktree) => worktree.repoId === expectedRepoId)
        .map((worktree) => ({ id: worktree.id, path: worktree.path })) ?? [],
    repoId
  )
  const id = candidates.find((candidate) => pathsMatch(candidate.path, worktreePath))?.id
  if (!id) {
    throw new Error(`Paired client did not catalog ${worktreePath}`)
  }
  return id
}

test('shows a worktree created outside Orca on a paired host', async ({
  registerPostElectronShutdownCleanup,
  sharedPage,
  testRepoPath
}, testInfo) => {
  test.setTimeout(120_000)
  const suffix = `${Date.now()}-${testInfo.workerIndex}`
  const branch = `e2e-paired-external-${suffix}`
  const externalPath = path.join(path.dirname(testRepoPath), branch)
  let client: PairedElectronClient | undefined
  let worktreeCreated = false
  registerPostElectronShutdownCleanup(async () => {
    if (worktreeCreated) {
      await gitExecFileAsync(['worktree', 'remove', '--force', externalPath], {
        cwd: testRepoPath
      }).catch(() => undefined)
      await gitExecFileAsync(['branch', '-D', branch], { cwd: testRepoPath }).catch(() => undefined)
    }
    rmSync(externalPath, { recursive: true, force: true })
  })
  try {
    const repos = await sharedPage.evaluate(
      () => window.__store?.getState().repos.map((repo) => ({ id: repo.id, path: repo.path })) ?? []
    )
    const repoId = repos.find((repo) => pathsMatch(repo.path, testRepoPath))?.id
    if (!repoId) {
      throw new Error(`Headed host did not catalog ${testRepoPath}`)
    }
    client = await launchPairedElectronClient(
      await createRuntimeDesktopPairingOffer(sharedPage),
      testInfo,
      'External worktree discovery'
    )

    await expect
      .poll(
        () =>
          client?.page.evaluate(
            (expectedRepoId) =>
              window.__store?.getState().repos.some((repo) => repo.id === expectedRepoId) ?? false,
            repoId
          ),
        { timeout: 30_000 }
      )
      .toBe(true)
    await expect
      .poll(
        async () => {
          if (!client) {
            return false
          }
          const paths = await client.page.evaluate(
            (expectedRepoId) =>
              window.__store
                ?.getState()
                .allWorktrees()
                .filter((worktree) => worktree.repoId === expectedRepoId)
                .map((worktree) => worktree.path) ?? [],
            repoId
          )
          return paths.some((candidate) => pathsMatch(candidate, testRepoPath))
        },
        { timeout: 30_000 }
      )
      .toBe(true)

    await gitExecFileAsync(['worktree', 'add', '--quiet', '-b', branch, externalPath], {
      cwd: testRepoPath
    })
    worktreeCreated = true

    await expect
      .poll(
        async () => {
          if (!client) {
            return false
          }
          const paths = await client.page.evaluate(
            (expectedRepoId) =>
              window.__store
                ?.getState()
                .allWorktrees()
                .filter((worktree) => worktree.repoId === expectedRepoId)
                .map((worktree) => worktree.path) ?? [],
            repoId
          )
          return paths.some((candidate) => pathsMatch(candidate, externalPath))
        },
        { timeout: 30_000 }
      )
      .toBe(true)
    const externalId = await findWorktreeId(client.page, repoId, externalPath)
    await expect(worktreeRow(client.page, externalId)).toBeVisible()
  } finally {
    await client?.dispose()
  }
})
