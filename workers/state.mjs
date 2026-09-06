import { readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

async function counter(file) {
  try { return Number((await readFile(file, 'utf8')).trim()) || 0 } catch { return 0 }
}

export function createStateWriter(file = '/tmp/mc-worker-state.json') {
  let previousCpu = 0; let previousTime = Date.now(); let sequence = Promise.resolve()
  return function write(state) {
    sequence = sequence.catch(() => {}).then(async () => {
      let cpu = 0
      try {
        const stat = await readFile('/sys/fs/cgroup/cpu.stat', 'utf8')
        cpu = Number(stat.match(/^usage_usec (\d+)$/m)?.[1] || 0)
      } catch { /* Resource metrics are optional outside Linux. */ }
      const now = Date.now()
      const cpuPercent = previousCpu ? Math.max(0, (cpu - previousCpu) / Math.max(1, now - previousTime) / 10) : 0
      previousCpu = cpu; previousTime = now
      const payload = { ...state, cpu_percent: Math.round(cpuPercent * 100) / 100,
        memory_bytes: await counter('/sys/fs/cgroup/memory.current'),
        swap_bytes: await counter('/sys/fs/cgroup/memory.swap.current'), updated_at: Math.floor(now / 1000) }
      const temporary = `${file}.${randomUUID()}.tmp`
      await writeFile(temporary, JSON.stringify(payload), { mode: 0o600 })
      await rename(temporary, file)
      return payload
    })
    return sequence
  }
}


