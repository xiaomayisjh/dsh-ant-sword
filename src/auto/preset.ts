import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionSeq } from '@deepseek-ai/dsh-session'

interface PresetObservation {
  scannedThrough: number
  preset: string | undefined
}

const observations = new WeakMap<object, PresetObservation>()

/** Resolve the current preset from the session header and later selections. */
export function isAutoPreset(agent: Agent): boolean {
  const session = agent.session
  let observed = observations.get(session)
  if (observed === undefined || observed.scannedThrough > session.seq) {
    observed = { scannedThrough: 0, preset: session.header.agentPreset }
  }
  for (let seq = observed.scannedThrough; seq < session.seq; seq++) {
    const event = session.eventAt(SessionSeq(seq)) as { type: string; data?: { agentPreset?: unknown } } | undefined
    if (event?.type === 'agent-preset/selected' && typeof event.data?.agentPreset === 'string') {
      observed.preset = event.data.agentPreset
    }
  }
  observed.scannedThrough = session.seq
  observations.set(session, observed)
  return observed.preset === 'red-team-auto'
}
