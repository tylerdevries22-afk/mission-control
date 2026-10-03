import { stripDoctorGutter } from '@/lib/openclaw-doctor-info'

function contentIndent(line: string): number {
  const content = line.replace(/\u001b\[[0-9;]*m/g, '').replace(/^\s*[│┃║┆┊╎╏]/, '')
  return content.length - content.trimStart().length
}

/** Keep wrapped bullet text together without absorbing a later section or instruction. */
export function collectDoctorBullets(raw: string): string[] {
  const bullets: string[] = []
  let bulletIndent: number | null = null
  for (const line of raw.split(/\r?\n/)) {
    const content = stripDoctorGutter(line)
    if (/^[-*]\s+/.test(content)) {
      bullets.push(content.replace(/^[-*]\s+/, '').trim())
      bulletIndent = contentIndent(line)
    } else if (content && bulletIndent !== null && contentIndent(line) > bulletIndent
      && !/^[◇◆┌└┐┘╭╮╰╯?]|^[-─━]{3,}/.test(content)) {
      bullets[bullets.length - 1] += ` ${content}`
    } else {
      bulletIndent = null
    }
  }
  return bullets
}
