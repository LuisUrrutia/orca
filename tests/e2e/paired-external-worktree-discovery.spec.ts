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
import { launchHeadlessPairedRuntimeHost } from './helpers/headless-paired-runtime-host'
import { worktreeRow } from './worktree-row-locators'

async function findWorktreeId(page: Page, repoId: string, worktreePath: string): Promise<string> {
  const id = await page.evaluate(
    ({ expectedPath, expectedRepoId }) => {
      const normalize = (value: string): string =>
        value.startsWith('/private/var/') ? value.slice('/private'.length) : value
      return (
        window.__store
          ?.getState()
          .allWorktrees()
          .find(
            (worktree) =>
              worktree.repoId === expectedRepoId &&
              normalize(worktree.path) === normalize(expectedPath)
          )?.id ?? null
      )
    },
    { expectedPath: worktreePath, expectedRepoId: repoId }
  )
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
    const repoId = await sharedPage.evaluate((expectedPath) => {
      const normalize = (value: string): string =>
        value.startsWith('/private/var/') ? value.slice('/private'.length) : value
      const repo = window.__store
        ?.getState()
        .repos.find((candidate) => normalize(candidate.path) === normalize(expectedPath))
      if (!repo) {
        throw new Error(`Headed host did not catalog ${expectedPath}`)
      }
      return repo.id
    }, testRepoPath)
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
        () =>
          client?.page.evaluate(
            ({ expectedPath, expectedRepoId }) => {
              const normalize = (value: string): string =>
                value.startsWith('/private/var/') ? value.slice('/private'.length) : value
              const paths =
                window.__store
                  ?.getState()
                  .allWorktrees()
                  .filter((worktree) => worktree.repoId === expectedRepoId)
                  .map((worktree) => worktree.path) ?? []
              return paths.some((candidate) => normalize(candidate) === normalize(expectedPath))
            },
            { expectedPath: testRepoPath, expectedRepoId: repoId }
          ),
        { timeout: 30_000 }
      )
      .toBe(true)

    await gitExecFileAsync(['worktree', 'add', '--quiet', '-b', branch, externalPath], {
      cwd: testRepoPath
    })
    worktreeCreated = true

    await expect
      .poll(
        () =>
          client?.page.evaluate(
            ({ expectedPath, expectedRepoId }) => {
              const normalize = (value: string): string =>
                value.startsWith('/private/var/') ? value.slice('/private'.length) : value
              return (
                window.__store
                  ?.getState()
                  .allWorktrees()
                  .some(
                    (worktree) =>
                      worktree.repoId === expectedRepoId &&
                      normalize(worktree.path) === normalize(expectedPath)
                  ) ?? false
              )
            },
            { expectedPath: externalPath, expectedRepoId: repoId }
          ),
        { timeout: 30_000 }
      )
      .toBe(true)
    const externalId = await findWorktreeId(client.page, repoId, externalPath)
    await expect(worktreeRow(client.page, externalId)).toBeVisible()
  } finally {
    await client?.dispose()
  }
})

test('polls external worktrees from a paired host without catalog events', async ({
  registerPostElectronShutdownCleanup,
  testRepoPath
}, testInfo) => {
  test.setTimeout(180_000)
  const suffix = `${Date.now()}-${testInfo.workerIndex}`
  const branch = `e2e-paired-legacy-${suffix}`
  const externalPath = path.join(path.dirname(testRepoPath), branch)
  const host = await launchHeadlessPairedRuntimeHost()
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
    const status = (await host.client.call<{ capabilities?: string[] }>('status.get')).result
    expect(status.capabilities).not.toContain('worktree.catalog-events.v1')
    await host.client.call('settings.update', {
      worktreeVisibilityDefaults: { external: 'show' }
    })
    await host.client.call('repo.add', { path: testRepoPath, kind: 'git' })
    client = await launchPairedElectronClient(
      host.offer,
      testInfo,
      'Legacy external worktree discovery'
    )
    await expect
      .poll(
        () =>
          client?.page.evaluate((expectedPath) => {
            const normalize = (value: string): string =>
              value.startsWith('/private/var/') ? value.slice('/private'.length) : value
            return (
              window.__store
                ?.getState()
                .repos.find((repo) => normalize(repo.path) === normalize(expectedPath))?.id ?? null
            )
          }, testRepoPath),
        { timeout: 30_000 }
      )
      .not.toBeNull()
    const repoId = await client.page.evaluate((expectedPath) => {
      const normalize = (value: string): string =>
        value.startsWith('/private/var/') ? value.slice('/private'.length) : value
      return (
        window.__store
          ?.getState()
          .repos.find((repo) => normalize(repo.path) === normalize(expectedPath))?.id ?? null
      )
    }, testRepoPath)
    if (typeof repoId !== 'string') {
      throw new Error(`Paired client did not catalog ${testRepoPath}`)
    }
    await expect
      .poll(
        () =>
          client?.page.evaluate(
            (expectedRepoId) =>
              window.__store
                ?.getState()
                .allWorktrees()
                .some((worktree) => worktree.repoId === expectedRepoId) ?? false,
            repoId
          ),
        { timeout: 30_000 }
      )
      .toBe(true)

    await gitExecFileAsync(['worktree', 'add', '--quiet', '-b', branch, externalPath], {
      cwd: testRepoPath
    })
    worktreeCreated = true

    await expect
      .poll(
        () =>
          client?.page.evaluate(
            ({ expectedPath, expectedRepoId }) => {
              const normalize = (value: string): string =>
                value.startsWith('/private/var/') ? value.slice('/private'.length) : value
              return (
                window.__store
                  ?.getState()
                  .allWorktrees()
                  .some(
                    (worktree) =>
                      worktree.repoId === expectedRepoId &&
                      normalize(worktree.path) === normalize(expectedPath)
                  ) ?? false
              )
            },
            { expectedPath: externalPath, expectedRepoId: repoId }
          ),
        { timeout: 75_000 }
      )
      .toBe(true)
    const externalId = await findWorktreeId(client.page, repoId, externalPath)
    await expect(worktreeRow(client.page, externalId)).toBeVisible()
  } finally {
    await client?.dispose()
    await host.dispose()
  }
})
