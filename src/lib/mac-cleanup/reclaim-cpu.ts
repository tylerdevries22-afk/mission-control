import { homedir } from 'node:os'
import { runCommand } from '@/lib/command'
import { devProjectRoot, isProtectedPath, parseLsofCwdMap } from './protect'
import type { ReclaimAction } from './reclaim-targets'

const WORKER = /(node-gyp|webpack|esbuild|\bvite\b|\btsc\b)/i
const AGENT = /(claude|codex|kimi|grok|openclaw|cursor|chatgpt|hermes)/i

export function parseHighCpuWorkers(psStdout: string): Array<{ pid: number; cpu: number; command: string }> {
  const rows: Array<{ pid: number; cpu: number; command: string }> = []
  for (const line of psStdout.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+([\d.]+)\s+(.*)$/)
    if (!match) continue
    const pid = Number.parseInt(match[1], 10)
    const cpu = Number.parseFloat(match[2])
    const command = match[3]
    if (!Number.isFinite(pid) || !Number.isFinite(cpu) || cpu < 25) continue
    if (AGENT.test(command) || !WORKER.test(command)) continue
    rows.push({ pid, cpu, command })
  }
  return rows
}

export async function reclaimIdleCpu(
  protectedRoots: string[],
  mutate: boolean,
  home = homedir(),
): Promise<ReclaimAction[]> {
  let ps = ''
  let lsof = ''
  try {
    ps = (await runCommand('ps', ['axo', 'pid=,pcpu=,command='], { timeoutMs: 5000 })).stdout
  } catch (error) {
    ps = String((error as { stdout?: string }).stdout ?? '')
  }
  try {
    lsof = (await runCommand('lsof', ['-a', '-d', 'cwd', '-Fn'], { timeoutMs: 8000 })).stdout
  } catch (error) {
    lsof = String((error as { stdout?: string }).stdout ?? '')
  }
  const cwds = parseLsofCwdMap(lsof)
  const actions: ReclaimAction[] = []
  for (const worker of parseHighCpuWorkers(ps)) {
    const cwd = cwds.get(worker.pid)
    if (!cwd) {
      actions.push({ id: `cpu:${worker.pid}`, path: worker.command, status: 'deferred', reason: 'cwd unknown; fail closed' })
      continue
    }
    const project = devProjectRoot(cwd, home)
    if (!project || isProtectedPath(cwd, protectedRoots) || !project.includes('/Dev/_idle/')) {
      actions.push({ id: `cpu:${worker.pid}`, path: cwd, status: 'protected', reason: 'Worker is outside idle trees' })
      continue
    }
    if (!mutate) {
      actions.push({ id: `cpu:${worker.pid}`, path: cwd, status: 'skipped', reason: `Would stop idle worker at ${worker.cpu}% CPU` })
      continue
    }
    try {
      process.kill(worker.pid, 'SIGTERM')
      actions.push({ id: `cpu:${worker.pid}`, path: cwd, status: 'cleaned', reason: `Stopped idle worker at ${worker.cpu}% CPU` })
    } catch {
      actions.push({ id: `cpu:${worker.pid}`, path: cwd, status: 'deferred', reason: 'Signal failed' })
    }
  }
  return actions
}
