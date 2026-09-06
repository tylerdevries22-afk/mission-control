export const RESULT_RETENTION_SECONDS = 120

// expires_at bounds the whole Machine lease, including time to collect results.
export function workDeadline(job, startedAt = Date.now()) {
  const deadline = Math.min(startedAt + job.timeout_seconds * 1000,
    (job.expires_at - RESULT_RETENTION_SECONDS) * 1000)
  if (deadline <= startedAt) throw new Error('Job lease cannot cover result retention')
  return deadline
}

export async function retainResult(sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))) {
  await sleep(RESULT_RETENTION_SECONDS * 1000)
}


