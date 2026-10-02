import { z } from 'zod'

const summaryLine = z.string().max(240).regex(/^(?:test_file (?:passed|failed) id=[a-f0-9]{16} tests=\d{1,8} duration_ms=\d{1,9}(?:\.\d{1,3})?|(?:tests|test_files)(?: (?:passed|failed|skipped|todo)=\d{1,8}){1,4}|duration \d{1,9}(?:\.\d{1,3})?(?:ms|s)|test_runner version=\d{1,3}\.\d{1,3}\.\d{1,3})$/)

const ordinal = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable()
const phases = z.enum(['configuration', 'program_creation', 'program_snapshot', 'program_matching', 'config', 'options',
  'global', 'global_initial_entry', 'global_initial_exit', 'target_loop_entry', 'target_loop_exit',
  'global_final_entry', 'global_final_exit', 'syntactic', 'semantic', 'declaration', 'normalization', 'source_verification'])
const witness = z.strictObject({
  reason: z.enum(['worker_timeout', 'abnormal_exit', 'output_limit', 'spawn_failed', 'invalid_progress', 'incomplete']),
  signal: z.enum(['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGSEGV']).nullable(),
  at: z.tuple([z.number().int().min(1).max(4096), phases, ordinal, z.number().int().min(0).max(255).nullable(),
    z.number().int().min(0).max(120000)]).nullable(),
  cg: z.tuple([z.union([z.literal(1), z.literal(2)]).nullable(), z.enum(['local', 'hierarchy']).nullable(),
    ordinal, ordinal, ordinal, ordinal, ordinal]).nullable(),
}).refine(value => value.at !== null || value.cg !== null)
const prefix = 'error: TypeScript worker witness '
const witnessLine = z.string().max(350).refine(line => {
  if (!line.startsWith(prefix)) return false
  try { return witness.safeParse(JSON.parse(line.slice(prefix.length))).success } catch { return false }
})
const tailLine = z.union([summaryLine, witnessLine])

export const timeoutDiagnosticsSchema = z.strictObject({
  version: z.literal(1),
  stage: z.enum(['command', 'repository_fetch', 'dependency_setup', 'browser_setup', 'node_availability',
    'package_manager_availability', 'chromium_smoke', 'verification_smoke', 'verification_test',
    'verification_lint', 'verification_typecheck', 'verification_build', 'verification_test_e2e']),
  output_tail: z.array(tailLine).max(12), output_omitted: z.boolean(),
})
