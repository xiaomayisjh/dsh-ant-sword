#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

class SmokeError extends Error {
  constructor(phase, code, details = {}) {
    super(code)
    this.phase = phase
    this.code = code
    this.details = details
  }
}

function optionsFromArgv(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      profile: { type: 'string', default: 'ant-sword-rc23-smoke' },
      port: { type: 'string', default: '0' },
      timeout: { type: 'string', default: '300' },
      'dsh-bin': { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  })
  if (values.help) return { help: true }
  const port = Number(values.port)
  const timeoutSeconds = Number(values.timeout)
  if (!/^[a-z0-9][a-z0-9-]*$/.test(values.profile)) throw new SmokeError('arguments', 'INVALID_PROFILE')
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new SmokeError('arguments', 'INVALID_PORT')
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 3600) {
    throw new SmokeError('arguments', 'INVALID_TIMEOUT')
  }
  return {
    profile: values.profile,
    port,
    timeoutMs: timeoutSeconds * 1000,
    dshBin: values['dsh-bin'],
  }
}

function dshEntry(explicit) {
  if (explicit !== undefined) {
    const entry = resolve(explicit)
    if (!existsSync(entry)) throw new SmokeError('startup', 'DSH_BIN_MISSING')
    return entry
  }
  const command = process.platform === 'win32' ? 'where.exe' : 'which'
  const name = process.platform === 'win32' ? 'dsh.cmd' : 'dsh'
  const located = spawnSync(command, [name], { encoding: 'utf8', windowsHide: true })
  if (located.status !== 0) throw new SmokeError('startup', 'DSH_NOT_FOUND')
  for (const line of located.stdout.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) {
    const packageEntry = join(dirname(line), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    if (existsSync(packageEntry)) return packageEntry
    const real = realpathSync(line)
    if (real.endsWith('.js') && existsSync(real)) return real
  }
  throw new SmokeError('startup', 'DSH_ENTRY_NOT_FOUND')
}

async function assertPortFree(port) {
  if (port === 0) return
  await new Promise((done, fail) => {
    const probe = createServer()
    probe.once('error', () => fail(new SmokeError('startup', 'PORT_IN_USE')))
    probe.listen(port, '127.0.0.1', () => probe.close(done))
  })
}

function startWeb(entry, { profile, port }, signal) {
  const child = spawn(process.execPath, [entry, '--profile', profile, '--no-open', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: projectRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  // DSH's startup URL carries a one-time authentication token. Consume both
  // streams without echoing or retaining their contents in diagnostics.
  child.stderr.resume()
  const ready = new Promise((done, fail) => {
    let pending = ''
    const abort = () => fail(new SmokeError('startup', 'TIMED_OUT'))
    signal.addEventListener('abort', abort, { once: true })
    child.once('error', () => fail(new SmokeError('startup', 'DSH_SPAWN_FAILED')))
    child.once('exit', (code) => fail(new SmokeError('startup', 'DSH_EXITED', { exitCode: code })))
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      const lines = (pending + chunk).split(/\r?\n/)
      pending = lines.pop().slice(-16384)
      for (const line of lines) {
        const match = line.match(/dsh web:\s+(http:\/\/[^\s)]+)/)
        if (match === null) continue
        let url
        try { url = new URL(match[1]) } catch { continue }
        if (url.hostname !== '127.0.0.1' || !url.searchParams.get('token')) continue
        signal.removeEventListener('abort', abort)
        done(url)
        return
      }
    })
  })
  return { child, ready }
}

async function browserCookie(launchUrl, signal) {
  const response = await fetch(launchUrl, { redirect: 'manual', signal })
  if (response.status !== 303) throw new SmokeError('authentication', `HTTP_${response.status}`)
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0]
  if (cookie === undefined || cookie === '') throw new SmokeError('authentication', 'COOKIE_MISSING')
  return cookie
}

function safeCode(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9/_-]{1,100}$/.test(value) ? value : 'RPC_FAILED'
}

function rpcClient(origin, cookie, signal) {
  return async (method, request) => {
    const rpcId = randomUUID()
    const response = await fetch(new URL(`/api/session/${method}`, origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId,
        method: `session/${method}`,
        payload: { args: { request } },
      }),
      signal,
    })
    if (!response.ok) throw new SmokeError(method, `HTTP_${response.status}`)
    const wire = await response.json()
    if (wire?.rpcId !== rpcId) throw new SmokeError(method, 'RPC_ID_MISMATCH')
    if (wire?.result?.ok !== true) throw new SmokeError(method, safeCode(wire?.result?.error?.code))
    return wire.result.value
  }
}

function inspect(records) {
  const events = records.map(record => record?.event).filter(Boolean)
  const calls = events.filter(event => event.type === 'tool/call' && event.data?.name === 'mcp_capabilities')
  for (const call of calls) {
    const result = events.find(event => event.type === 'tool/result'
      && event.data?.message?.toolCallId === call.data.callId)
    if (result === undefined) continue
    const turnEnd = events.find(event => event.type === 'turn/end'
      && event.data?.turn === call.data.turn && event.seq > result.seq)
    if (turnEnd === undefined) continue
    return {
      complete: true,
      toolSucceeded: result.data?.message?.isError !== true && result.data?.error === undefined,
      turn: call.data.turn,
      turnReason: turnEnd.data?.reason?.kind,
      eventCount: events.length,
    }
  }
  const failure = events.find(event => event.type === 'turn/end'
    && ['error', 'aborted', 'interrupted'].includes(event.data?.reason?.kind))
  return {
    complete: false,
    failed: failure !== undefined,
    toolSucceeded: false,
    turn: failure?.data?.turn,
    turnReason: failure?.data?.reason?.kind,
    eventCount: events.length,
    sawToolCall: calls.length > 0,
  }
}

async function smoke(options) {
  const began = Date.now()
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(), options.timeoutMs)
  let child
  let sessionId
  let lastObservation
  try {
    await assertPortFree(options.port)
    const launched = startWeb(dshEntry(options.dshBin), options, deadline.signal)
    child = launched.child
    const launchUrl = await launched.ready
    const cookie = await browserCookie(launchUrl, deadline.signal)
    const rpc = rpcClient(launchUrl.origin, cookie, deadline.signal)
    const created = await rpc('create', { cwd: projectRoot, agentPreset: 'red-team-auto' })
    sessionId = created?.sessionId
    if (typeof sessionId !== 'string' || created.agentPreset !== 'red-team-auto') {
      throw new SmokeError('create', 'PRESET_MISMATCH')
    }
    const accepted = await rpc('prompt', {
      requestId: randomUUID(),
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: '请调用 mcp_capabilities 查看可用能力，然后简短汇报。' }],
    })
    if (accepted?.accepted !== true) throw new SmokeError('prompt', 'PROMPT_NOT_ACCEPTED')

    while (!deadline.signal.aborted) {
      const projections = await rpc('projections', { sessionId })
      if (projections === null || !Number.isSafeInteger(projections?.asOfSeq)) {
        throw new SmokeError('projections', 'INVALID_CURSOR')
      }
      const page = await rpc('page', {
        address: { kind: 'session', sessionId },
        throughSeq: projections.asOfSeq,
        maxMessages: 200,
      })
      if (!Array.isArray(page?.records)) throw new SmokeError('page', 'INVALID_PAGE')
      const result = inspect(page.records)
      lastObservation = result
      if (result.complete) {
        if (!result.toolSucceeded) throw new SmokeError('verify', 'TOOL_FAILED', {
          sessionId, turn: result.turn, turnReason: result.turnReason, eventCount: result.eventCount,
        })
        if (result.turnReason !== 'completed') throw new SmokeError('verify', 'TURN_NOT_COMPLETED', {
          sessionId, turn: result.turn, turnReason: result.turnReason, eventCount: result.eventCount,
        })
        return { ok: true, profile: options.profile, sessionId, tool: 'mcp_capabilities', turn: result.turn,
          eventCount: result.eventCount, elapsedMs: Date.now() - began }
      }
      if (result.failed) throw new SmokeError('verify', 'TURN_FAILED', {
        sessionId, turn: result.turn, turnReason: result.turnReason, eventCount: result.eventCount,
      })
      await delay(1000, undefined, { signal: deadline.signal })
    }
    throw new SmokeError('verify', 'TIMED_OUT', { sessionId })
  } catch (error) {
    if (deadline.signal.aborted) throw new SmokeError('verify', 'TIMED_OUT', {
      sessionId,
      sawToolCall: lastObservation?.sawToolCall ?? false,
      eventCount: lastObservation?.eventCount ?? 0,
    })
    if (error instanceof SmokeError) {
      if (sessionId !== undefined && error.details.sessionId === undefined) error.details.sessionId = sessionId
      throw error
    }
    throw new SmokeError('runtime', 'UNEXPECTED', { sessionId })
  } finally {
    clearTimeout(timer)
    if (child !== undefined && child.exitCode === null) child.kill()
    child?.stdout.destroy()
    child?.stderr.destroy()
    child?.unref()
  }
}

try {
  const options = optionsFromArgv(process.argv.slice(2))
  if (options.help) {
    console.log('Usage: node scripts/smoke-web.mjs [--profile ant-sword-rc23-smoke] [--port 0] [--timeout 300] [--dsh-bin PATH]')
    console.log('Timeout is in seconds. Port 0 lets DSH choose a free loopback port.')
  } else {
    console.log(JSON.stringify(await smoke(options)))
  }
} catch (error) {
  const failure = error instanceof SmokeError ? error : new SmokeError('runtime', 'UNEXPECTED')
  console.error(JSON.stringify({ ok: false, phase: failure.phase, code: failure.code, ...failure.details }))
  process.exitCode = 1
}
