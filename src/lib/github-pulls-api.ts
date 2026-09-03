import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { fetchPullRequests, getGitHubToken } from '@/lib/github'
import { collectPullRequests, MAX_PRS_PER_REPO } from '@/lib/github-pulls'
import { logger } from '@/lib/logger'

export async function handleGitHubPulls(workspaceId: number) {
  try {
    const token = await getGitHubToken()
    if (!token) return NextResponse.json({ pullRequests: [] })

    const db = getDatabase()
    const rows = db.prepare(
      `SELECT github_repo FROM projects
       WHERE workspace_id = ? AND github_repo IS NOT NULL AND github_repo != ''`,
    ).all(workspaceId) as Array<{ github_repo: string }>

    const pullRequests = await collectPullRequests(
      rows.map((row) => row.github_repo),
      (repo) => fetchPullRequests(repo, { state: 'open', per_page: MAX_PRS_PER_REPO }),
    )
    return NextResponse.json({ pullRequests })
  } catch (error) {
    logger.error({ err: error }, 'GET /api/github?action=pulls error')
    return NextResponse.json({ pullRequests: [] })
  }
}
