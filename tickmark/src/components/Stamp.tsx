import { type ItemStatus } from '../types'
import './Stamp.css'

const GLYPH: Record<Exclude<ItemStatus, 'not-run'>, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  blocked: 'BLOCKED',
}

/**
 * A rubber stamp that thunks down slightly crooked, like a tester pressing
 * a real stamp onto the page. Remount (key change) replays the thunk.
 */
export default function Stamp({ status }: { status: ItemStatus }) {
  if (status === 'not-run') return null
  return (
    <span
      key={status}
      className={`stamp stamp--${status}`}
      role="img"
      aria-label={`Marked ${GLYPH[status].toLowerCase()}`}
    >
      <span className="stamp__ink">{GLYPH[status]}</span>
    </span>
  )
}
