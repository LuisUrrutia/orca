import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listWorktrees, listWorktreesStrict } from '../git/worktree'
import { notifyWorktreesChanged } from '../ipc/worktree-remote'
import { setRepoRemoteClientNotifier } from '../ipc/repos/repos-changed-notification'
import { OrcaRuntimeService } from './orca-runtime'
import {
  authenticate,
  createReader,
  makeStore,
  REPO_ID,
  resultType,
  send,
  type PairedSession,
  type ResponseReader
} from './paired-client-navigation-test-harness'
import { OrcaRuntimeRpcServer } from './runtime-rpc'

vi.mock('../git/worktree', () => ({
  listWorktrees: vi.fn(),
  listWorktreesStrict: vi.fn()
}))

const initialWorktree = {
  path: '/tmp/repo',
  head: 'initial-head',
  branch: 'refs/heads/main',
  isBare: false,
  isMainWorktree: true
}
const externalWorktree = {
  path: '/tmp/external-worktree',
  head: 'external-head',
  branch: 'refs/heads/external-worktree',
  isBare: false,
  isMainWorktree: false
}

function catalogPaths(response: Record<string, unknown>): string[] {
  return ((response.result as { worktrees?: { path: string }[] } | undefined)?.worktrees ?? []).map(
    (worktree) => worktree.path
  )
}

describe('external worktree discovery for paired clients', () => {
  const servers: OrcaRuntimeRpcServer[] = []
  const sessions: PairedSession[] = []
  const readers: ResponseReader[] = []
  const tempDirs: string[] = []

  afterEach(async () => {
    for (const reader of readers.splice(0)) {
      reader.dispose()
    }
    for (const session of sessions.splice(0)) {
      session.ws.close()
    }
    await Promise.all(servers.splice(0).map((server) => server.stop()))
    for (const path of tempDirs.splice(0)) {
      rmSync(path, { recursive: true, force: true })
    }
    vi.clearAllMocks()
  })

  it('publishes an externally observed worktree to the paired client catalog', async () => {
    vi.mocked(listWorktrees).mockResolvedValue([initialWorktree])
    vi.mocked(listWorktreesStrict).mockResolvedValue([initialWorktree])
    const runtime = new OrcaRuntimeService(makeStore() as never)
    setRepoRemoteClientNotifier(runtime)
    const userDataPath = mkdtempSync(join(tmpdir(), 'orca-ewd-'))
    tempDirs.push(userDataPath)
    const server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath,
      enableWebSocket: true,
      wsPort: 0
    })
    servers.push(server)
    await server.start()
    const offer = server.createPairingOffer({
      address: '127.0.0.1',
      name: 'paired-client',
      scope: 'runtime'
    })
    if (!offer.available) {
      throw new Error('pairing_unavailable')
    }
    const client = await authenticate(offer.pairingUrl)
    const reader = createReader(client)
    sessions.push(client)
    readers.push(reader)

    send(client, { id: 'events', method: 'runtime.clientEvents.subscribe' })
    await reader.next('events', (response) => resultType(response) === 'ready')
    send(client, {
      id: 'initial-catalog',
      method: 'worktree.list',
      params: { repo: REPO_ID, limit: 100 }
    })
    expect(catalogPaths(await reader.next('initial-catalog'))).toEqual(['/tmp/repo'])

    vi.mocked(listWorktrees).mockResolvedValue([initialWorktree, externalWorktree])
    vi.mocked(listWorktreesStrict).mockResolvedValue([initialWorktree, externalWorktree])
    notifyWorktreesChanged(
      { isDestroyed: () => false, webContents: { send: vi.fn() } } as never,
      REPO_ID
    )

    await expect(
      Promise.race([
        reader.next('events', (response) => resultType(response) === 'worktreesChanged'),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('paired client did not receive worktree discovery')),
            250
          )
        )
      ])
    ).resolves.toMatchObject({ result: { type: 'worktreesChanged', repoId: REPO_ID } })
    send(client, {
      id: 'refreshed-catalog',
      method: 'worktree.list',
      params: { repo: REPO_ID, limit: 100 }
    })
    expect(catalogPaths(await reader.next('refreshed-catalog'))).toEqual([
      '/tmp/repo',
      '/tmp/external-worktree'
    ])
  })
})
