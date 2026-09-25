/** Windows paths are case-insensitive. Full canonical path avoids basename collisions. */
export function photoIdentity(path: string): string {
  return `photo:${path.replace(/\\/g, '/').replace(/\/+$/,'').toLowerCase()}`
}
