import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'

const LISTENING_PATTERN = /Frontend server listening on http:\/\/0\.0\.0\.0:(\d+)/

export function waitForListeningPort(child, { timeoutMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''

    const cleanup = () => {
      clearTimeout(timeout)
      child.stdout?.off('data', onStdout)
      child.stderr?.off('data', onStderr)
      child.off('error', onError)
      child.off('exit', onExit)
    }
    const fail = (error) => {
      cleanup()
      reject(error)
    }
    const onStdout = (chunk) => {
      stdout += chunk.toString()
      const match = stdout.match(LISTENING_PATTERN)
      if (!match) return

      const port = Number(match[1])
      if (!Number.isInteger(port) || port <= 0) {
        fail(new Error(`frontend server reported an invalid listening port: ${match[1]}`))
        return
      }

      cleanup()
      resolve(port)
    }
    const onStderr = (chunk) => {
      stderr += chunk.toString()
    }
    const onError = (error) => fail(error)
    const onExit = (code, signal) => {
      fail(
        new Error(
          `frontend server exited before readiness (code=${code}, signal=${signal})\n${stdout}${stderr}`,
        ),
      )
    }
    const timeout = setTimeout(() => {
      fail(new Error(`frontend server did not become ready\n${stdout}${stderr}`))
    }, timeoutMs)

    child.stdout?.on('data', onStdout)
    child.stderr?.on('data', onStderr)
    child.once('error', onError)
    child.once('exit', onExit)
  })
}

export async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return

  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  await Promise.race([exited, delay(2_000)])

  if (child.exitCode === null && child.signalCode === null) {
    const killed = once(child, 'exit')
    child.kill('SIGKILL')
    await killed
  }
}
