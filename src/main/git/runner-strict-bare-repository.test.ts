import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }))

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  execFileSync: vi.fn(),
  spawn: vi.fn()
}))

import { gitExecFileAsync, gitExecFileAsyncBuffer } from './runner'

function strictBareRepositoryError(): Error & { stderr: string } {
  return Object.assign(new Error('git failed'), {
    stderr: "fatal: cannot use bare repository '/repo.git' (safe.bareRepository is 'explicit')"
  })
}

function childProcess(): EventEmitter {
  return Object.assign(new EventEmitter(), { kill: vi.fn() })
}

describe('git strict bare repository retry', () => {
  beforeEach(() => {
    execFileMock.mockReset()
  })

  it('does not retry commands unless the caller trusts the repository read', async () => {
    execFileMock.mockImplementation((_command, _args, _options, callback) => {
      const error = strictBareRepositoryError()
      callback(error, '', error.stderr)
      return childProcess()
    })

    await expect(gitExecFileAsync(['status'], { cwd: '/repo.git' })).rejects.toThrow('git failed')

    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  it('retries an opted-in repository read with an explicit gitdir', async () => {
    execFileMock
      .mockImplementationOnce((_command, _args, _options, callback) => {
        const error = strictBareRepositoryError()
        callback(error, '', error.stderr)
        return childProcess()
      })
      .mockImplementationOnce((_command, _args, _options, callback) => {
        callback(null, 'ok', '')
        return childProcess()
      })

    await expect(
      gitExecFileAsync(['worktree', 'list', '--porcelain'], {
        cwd: '/repo.git',
        allowExplicitBareRepositoryRetry: true
      })
    ).resolves.toEqual({ stdout: 'ok', stderr: '' })

    expect(execFileMock.mock.calls.map(([, args]) => args)).toEqual([
      ['worktree', 'list', '--porcelain'],
      ['--git-dir=.', 'worktree', 'list', '--porcelain']
    ])
  })

  it('retries opted-in binary reads when Git reports the failure as a buffer', async () => {
    const errorText = strictBareRepositoryError().stderr
    execFileMock
      .mockImplementationOnce((_command, _args, _options, callback) => {
        callback(new Error('git failed'), Buffer.alloc(0), Buffer.from(errorText))
        return childProcess()
      })
      .mockImplementationOnce((_command, _args, _options, callback) => {
        callback(null, Buffer.from('blob'), Buffer.alloc(0))
        return childProcess()
      })

    await expect(
      gitExecFileAsyncBuffer(['show', 'HEAD:file.txt'], {
        cwd: '/repo.git',
        allowExplicitBareRepositoryRetry: true
      })
    ).resolves.toEqual({ stdout: Buffer.from('blob') })

    expect(execFileMock.mock.calls.map(([, args]) => args)).toEqual([
      ['show', 'HEAD:file.txt'],
      ['--git-dir=.', 'show', 'HEAD:file.txt']
    ])
  })
})
