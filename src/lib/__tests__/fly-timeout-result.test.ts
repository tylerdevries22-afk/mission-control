// @vitest-environment node
import Database from 'better-sqlite3'
import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recordPolledResult, readPolledResult, readStoredTimeoutDiagnostics, settleFlyJob } from '../fly-polled-result'
import { flySubmissionStatus } from '../fly-admission'
import type { ReservedJob } from '../fly-reservations'

vi.mock('../event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
const diagnostic = { version: 1, stage: 'verification_test', output_tail: ['tests passed=3'], output_omitted: true }
const identity = { id: 'job', branch_name: 'mc/fly-task-1-abcd1234' }
const state = () => ({ job_id: identity.id, branch_name: identity.branch_name, state: 'failed',
  result_sha: null, resolution: null, error_message: 'Verification test exceeded the job deadline',
  updated_at: Math.floor(Date.now() / 1000), timeout_diagnostics: diagnostic })
let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`CREATE TABLE fly_submissions(id TEXT,task_id INTEGER,workspace_id INTEGER,state TEXT,reason TEXT,attempts INTEGER,
    session_id TEXT,swarm_id TEXT,created_at INTEGER,updated_at INTEGER,next_attempt_at INTEGER);
    CREATE TABLE fly_worker_jobs(id TEXT,submission_id TEXT,task_id INTEGER,workspace_id INTEGER,state TEXT,branch_name TEXT,
    outcome_json TEXT,started_at INTEGER,created_at INTEGER,hourly_rate_usd REAL,observed_cost_usd REAL,estimated_cost_usd REAL,
    completed_at INTEGER,cleanup_completed_at INTEGER,runtime_seconds INTEGER,error_message TEXT,heartbeat_at INTEGER,
    cpu_percent REAL,memory_bytes REAL,swap_bytes REAL,peak_cpu_percent REAL,peak_memory_bytes REAL,machine_id TEXT,image_kind TEXT);
    CREATE TABLE tasks(id INTEGER,workspace_id INTEGER,status TEXT,resolution TEXT,error_message TEXT,updated_at INTEGER);
    INSERT INTO fly_submissions VALUES('submission',1,1,'running',NULL,1,'session',NULL,1,1,0);
    INSERT INTO tasks VALUES(1,1,'in_progress',NULL,NULL,1);`)
  db.prepare(`INSERT INTO fly_worker_jobs(id,submission_id,task_id,workspace_id,state,branch_name,created_at,hourly_rate_usd,
    observed_cost_usd,peak_cpu_percent,peak_memory_bytes) VALUES(?,'submission',1,1,'running',?,unixepoch(),0.1,0,0,0)`)
    .run(identity.id, identity.branch_name)
})
afterEach(() => { db.close() })

function currentJob() { return db.prepare('SELECT * FROM fly_worker_jobs').get() as ReservedJob }

describe('bounded timeout storage and status', () => {
  it('stores and returns the exact projection through cleaning and confirmed settlement, never success or fallback', () => {
    recordPolledResult(db, currentJob(), JSON.stringify(state()))
    expect(currentJob()).toMatchObject({ state: 'cleaning', cleanup_completed_at: null })
    const cleaning = flySubmissionStatus(db, 1, 'submission', 'session')[0]
    expect(cleaning).toMatchObject({ safe_local_fallback: false, jobs: [{ timeout_diagnostics: diagnostic }] })
    settleFlyJob(db, currentJob())
    const settled = flySubmissionStatus(db, 1, 'submission', 'session')[0]
    expect(settled).toMatchObject({ state: 'failed', attempts: 1, safe_local_fallback: false,
      jobs: [{ state: 'failed', timeout_diagnostics: diagnostic }] })
    expect(db.prepare('SELECT status,resolution FROM tasks').get()).toEqual({ status: 'failed', resolution: null })
    expect(flySubmissionStatus(db, 2, 'submission')).toEqual([])
    expect(flySubmissionStatus(db, 1, 'submission', 'foreign')).toEqual([])
  })

  it('rejects unsafe, oversized, foreign and successful timeout evidence before any durable change', () => {
    const invalid = [
      { ...state(), job_id: 'foreign' }, { ...state(), branch_name: 'foreign' },
      { ...state(), state: 'succeeded', result_sha: 'a'.repeat(40) }, { ...state(), state: 'running' },
      { ...state(), timeout_diagnostics: { ...diagnostic, stage: 'private/path' } },
      { ...state(), timeout_diagnostics: { ...diagnostic, output_tail: ['Bearer fixture-only-secret'] } },
      { ...state(), timeout_diagnostics: { ...diagnostic, output_tail: Array(13).fill('tests passed=3') } },
      { ...state(), timeout_diagnostics: { ...diagnostic, raw_log: 'private' } },
    ]
    for (const value of invalid) {
      expect(() => recordPolledResult(db, currentJob(), JSON.stringify(value))).toThrow()
      expect(currentJob()).toMatchObject({ state: 'running', outcome_json: null })
      expect(readStoredTimeoutDiagnostics(JSON.stringify(value), identity)).toBeNull()
    }
  })

  it('legacy, missing, corrupt and foreign advisory state does not invent timeout evidence', () => {
    const legacy = { ...state(), timeout_diagnostics: undefined }
    expect(readPolledResult(JSON.stringify(legacy), identity).state).toBe('failed')
    for (const text of [null, 'corrupt', JSON.stringify(legacy), JSON.stringify({ ...state(), updated_at: 1e12 })]) {
      expect(readStoredTimeoutDiagnostics(text, identity)).toBeNull()
    }
    expect(readStoredTimeoutDiagnostics(JSON.stringify(state()), { ...identity, id: 'other' })).toBeNull()
  })
})

describe('actual native timeout / controller boundary', () => {
  it('round-trips the real original closed command and private writer through the current parser and status', () => {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { mkdtemp,readFile } from 'node:fs/promises';
      import { tmpdir } from 'node:os'; import path from 'node:path';
      import { createRunner } from './workers/process.mjs';
      import { readTimeoutDiagnostics } from './workers/timeout-diagnostics.mjs';
      import { createStateWriter } from './workers/state.mjs';
      const run=createRunner(Date.now()+3000); let diagnostic;
      try { await run(process.execPath,['-e',"console.log('Tests 3 passed (3)');console.error('fixture-only-omitted');setInterval(()=>{},1000)"],
        {label:'Verification test',timeoutMs:500}); throw new Error('Expected timeout'); }
      catch(error) { diagnostic=readTimeoutDiagnostics(error); if(!diagnostic) throw error; }
      const file=path.join(await mkdtemp(path.join(tmpdir(),'mc-timeout-contract.')),'state.json');
      await createStateWriter(file)({job_id:'job',branch_name:'mc/fly-task-1-abcd1234',state:'failed',
        error_message:'Verification test exceeded the job deadline',result_sha:null,resolution:null,
        timeout_diagnostics:diagnostic}); process.stdout.write(await readFile(file,'utf8'));
    `], { cwd: process.cwd(), timeout: 5000, encoding: 'utf8' })
    const result = recordPolledResult(db, currentJob(), output)
    expect(result).toMatchObject({ state: 'failed', result_sha: null, timeout_diagnostics: diagnostic })
    expect(flySubmissionStatus(db, 1, 'submission')[0].jobs[0].timeout_diagnostics).toEqual(diagnostic)
  })
})

describe('closed compiler witness projection', () => {
  it('persists only the exact finite witness grammar while retaining failed and cleanup ownership', () => {
    const witness = { reason: 'abnormal_exit', signal: 'SIGKILL', at: [12, 'global_initial_entry', 0, null, 3000],
      cg: [2, 'local', 4294967296, 1000, 1200, 0, 1] }
    const tail = (value: unknown) => 'error: TypeScript worker witness ' + JSON.stringify(value)
    const valid = { ...state(), timeout_diagnostics: { ...diagnostic, output_tail: [tail(witness)] } }
    expect(readPolledResult(JSON.stringify(valid), identity).timeout_diagnostics).toEqual(valid.timeout_diagnostics)
    for (const value of [{ ...witness, raw_log: 'fixture-only-secret' }, { ...witness, signal: 'private' },
      { ...witness, at: [12, 'private', 0, null, 3000] }, { ...witness, at: null, cg: null }]) {
      expect(() => readPolledResult(JSON.stringify({ ...valid,
        timeout_diagnostics: { ...diagnostic, output_tail: [tail(value)] } }), identity)).toThrow()
    }
    recordPolledResult(db, currentJob(), JSON.stringify(valid))
    expect(currentJob()).toMatchObject({ state: 'cleaning', cleanup_completed_at: null })
    expect(flySubmissionStatus(db, 1, 'submission')[0].jobs[0].timeout_diagnostics).toEqual(valid.timeout_diagnostics)
  })
})
