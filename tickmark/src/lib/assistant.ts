/**
 * The margin-notes assistant.
 *
 * There is no model call here on purpose: it is a small, predictable
 * suggestion engine. It reads plain-language notes, spots which areas of a
 * product the tester is talking about, asks one short follow-up, and offers
 * test steps as cards. It never edits the checklist — the tester accepts
 * suggestions one by one or all at once.
 */

export interface Suggestion {
  /** stable key, derived from the title */
  key: string
  title: string
  details?: string
  expected?: string
  section?: string
}

export interface DraftStep {
  title: string
  details?: string
  expected?: string
  section?: string
}

interface Pack {
  id: string
  label: string
  /** default section heading for these steps */
  section: string
  keywords: string[]
  /** the short follow-up question the pencil asks */
  ask: string
  core: DraftStep[]
  edge: DraftStep[]
}

const genericCore: DraftStep[] = [
  {
    title: 'Walk the main journey end to end',
    details: 'Start from a fresh session and use the product the way a first-time visitor would.',
    section: 'General',
  },
  {
    title: 'Try the same action twice',
    details: 'Double-click, double-submit, refresh mid-action.',
    expected: 'No duplicate records, no crashes.',
    section: 'General',
  },
  {
    title: 'Leave a required field empty',
    details: 'Submit the form with one required value missing.',
    expected: 'A clear, non-technical message appears next to the field.',
    section: 'General',
  },
]

const genericEdge: DraftStep[] = [
  {
    title: 'Reconnect after going offline',
    details: 'Turn off the network mid-action, then turn it back on.',
    expected: 'The app recovers or explains what happened; nothing is lost silently.',
    section: 'Edge cases',
  },
  {
    title: 'Paste in awkward text',
    details: 'Emoji, accented characters, a 😀🙃 mix, and a very long unbroken string.',
    expected: 'Text is stored and redisplayed exactly as entered.',
    section: 'Edge cases',
  },
  {
    title: 'Open the same screen in two tabs',
    details: 'Change something in tab A, then act in tab B.',
    expected: 'The app does not show stale or contradictory data.',
    section: 'Edge cases',
  },
]

const PACKS: Pack[] = [
  {
    id: 'auth',
    label: 'signing in',
    section: 'Sign in',
    keywords: ['login', 'log in', 'sign in', 'signin', 'auth', 'account access', 'session', 'logout', 'log out'],
    ask: 'When someone signs in, what should happen if they already have a session open?',
    core: [
      {
        title: 'Sign in with valid credentials',
        expected: 'You land on the right screen for that account, with your name visible.',
      },
      {
        title: 'Sign in with the wrong password',
        expected: 'A generic error is shown; it does not say which field was wrong.',
      },
      {
        title: 'Sign in with an email that does not exist',
        expected: 'Same generic error as a wrong password, no account enumeration.',
      },
      {
        title: 'Sign out, then use the back button',
        expected: 'You stay signed out; no cached private screen appears.',
      },
    ],
    edge: [
      {
        title: 'Sign in with leading/trailing spaces in the email',
        details: '"  tester@example.com " pasted from a notes app.',
        expected: 'Spaces are trimmed and sign-in succeeds.',
      },
      {
        title: 'Sign in with Caps Lock on',
        details: 'Password typed with the first letter capitalised.',
        expected: 'Rejected with a clear message, not a silent failure.',
      },
      {
        title: 'Sign in with a very old bookmark URL',
        expected: 'You are sent to the sign-in screen, then back to the intended page.',
      },
    ],
  },
  {
    id: 'password',
    label: 'password reset',
    section: 'Password reset',
    keywords: ['password reset', 'reset password', 'forgot password', 'forgot my password', 'password', 'change password'],
    ask: 'For the password reset: is the link meant to work once, or many times, and how long should it live?',
    core: [
      {
        title: 'Request a password reset for a real account',
        expected: 'A neutral confirmation appears and the email arrives within a minute.',
      },
      {
        title: 'Use the reset link and set a new password',
        expected: 'You can sign in with the new password straight away.',
      },
      {
        title: 'Old password stops working after the reset',
        expected: 'Sign-in with the previous password is refused.',
      },
    ],
    edge: [
      {
        title: 'Reuse the same reset link a second time',
        details: 'Use the link once, then open it again from the email.',
        expected: 'The link is refused with a friendly "request a new one" message.',
      },
      {
        title: 'Open an expired reset link',
        details: 'Wait past the expiry window, or nudge the clock forward.',
        expected: 'A clear expired-link message; the account is untouched.',
      },
      {
        title: 'Request a reset for an email with no account',
        expected: 'The same neutral confirmation as a real request (no account enumeration).',
      },
      {
        title: 'Set a new password that is too weak or too short',
        expected: 'The rules are explained before submitting, not after.',
      },
      {
        title: 'Reset while already signed in on another device',
        details: 'Complete the reset on phone while the desktop session is open.',
        expected: 'The decision on other sessions is deliberate, and it is written down somewhere.',
      },
      {
        title: 'Paste a password with an emoji or trailing space',
        expected: 'Stored and accepted exactly; no surprise trim or mojibake.',
      },
    ],
  },
  {
    id: 'search',
    label: 'search',
    section: 'Search',
    keywords: ['search', 'filter', 'find', 'query', 'results', 'sort'],
    ask: 'For search: should it match partial words and typos, or only exact terms?',
    core: [
      {
        title: 'Search for a term you know exists',
        expected: 'Relevant results appear, best match first.',
      },
      {
        title: 'Search for a term with no matches',
        expected: 'A friendly empty state, not a blank screen.',
      },
      {
        title: 'Search with a single letter',
        expected: 'Sensible behaviour: either all results or a "keep typing" hint.',
      },
    ],
    edge: [
      {
        title: 'Search with only spaces',
        details: 'Enter a few spaces and submit.',
        expected: 'Treated as an empty search, not a crash.',
      },
      {
        title: 'Search with emoji and accented letters',
        details: 'e.g. "café" and "🙂".',
        expected: 'Matches are found and displayed correctly.',
      },
      {
        title: 'Search while offline, then reconnect',
        expected: 'The app retries or explains the failure rather than hanging.',
      },
      {
        title: 'Search with a very long pasted string',
        details: 'A 500-character paste.',
        expected: 'Input is capped or handled; the page does not break.',
      },
    ],
  },
  {
    id: 'payment',
    label: 'payments',
    section: 'Payments',
    keywords: ['payment', 'pay', 'card', 'credit card', 'stripe', 'billing', 'invoice', 'refund', 'money', 'charge'],
    ask: 'For payments: which card states matter most — declined, expired, or 3-D Secure?',
    core: [
      {
        title: 'Pay for a normal order with a valid card',
        expected: 'One charge only, and a receipt or confirmation is shown.',
      },
      {
        title: 'Pay with a declined card',
        expected: 'A readable decline message; nothing is marked as paid.',
      },
      {
        title: 'Cancel out of payment and go back',
        expected: 'You can recover the order and choose another payment method.',
      },
      {
        title: 'Check the amount that was actually charged',
        details: 'Compare the amount shown, the receipt, and the payment provider dashboard.',
        expected: 'All three agree, including tax and currency.',
      },
    ],
    edge: [
      {
        title: 'Pay with an expired card',
        expected: 'Rejected before the payment is attempted, with a specific message.',
      },
      {
        title: 'Submit payment twice',
        details: 'Tap the pay button twice quickly, or double-click it.',
        expected: 'Exactly one charge; the button locks while processing.',
      },
      {
        title: 'Lose connection during payment',
        details: 'Kill the network after pressing pay.',
        expected: 'No silent charge: the order state is recoverable or clearly unknown.',
      },
      {
        title: 'Pay with a zero or negative amount',
        details: 'Discount code that brings the total to 0, or a quantity of -1.',
        expected: 'Rejected or handled deliberately; no free orders.',
      },
      {
        title: 'Pay with a mismatched billing address',
        expected: 'The provider decision is surfaced clearly to the tester.',
      },
      {
        title: 'Refresh on the payment confirmation screen',
        expected: 'Refreshing does not charge again or lose the receipt.',
      },
    ],
  },
  {
    id: 'checkout',
    label: 'checkout',
    section: 'Checkout',
    keywords: ['checkout', 'cart', 'basket', 'order', 'shipping', 'coupon', 'discount', 'delivery'],
    ask: 'For checkout: what counts as a valid order — and what should happen to an empty cart?',
    core: [
      {
        title: 'Check out with one item',
        expected: 'Totals, tax, and shipping are shown before you commit.',
      },
      {
        title: 'Change the quantity in the cart',
        expected: 'All totals update immediately and stay consistent.',
      },
      {
        title: 'Check out with an empty cart',
        expected: 'You are blocked with a clear message and a way back to the shop.',
      },
    ],
    edge: [
      {
        title: 'Apply a discount code that has expired',
        expected: 'A specific message; the price reverts correctly.',
      },
      {
        title: 'Add an item, then remove it, then check out',
        expected: 'No ghost line items on the confirmation.',
      },
      {
        title: 'Change currency or region mid-checkout',
        expected: 'Prices and totals switch consistently, or the change is refused.',
      },
      {
        title: 'Use a quantity at the allowed limit',
        details: 'The maximum in stock, and one more than that.',
        expected: 'The limit is enforced with a helpful message.',
      },
    ],
  },
  {
    id: 'booking',
    label: 'booking',
    section: 'Booking',
    keywords: ['booking', 'book', 'reservation', 'reserve', 'appointment', 'calendar', 'availability', 'slot', 'schedule'],
    ask: 'For booking: what should happen when two people want the same slot at once?',
    core: [
      {
        title: 'Book an available slot',
        expected: 'The slot is confirmed and disappears from availability.',
      },
      {
        title: 'Try to book a slot that is already taken',
        expected: 'A clear "no longer available" message and fresh options.',
      },
      {
        title: 'Cancel a booking',
        expected: 'The slot returns to availability and the cancellation is confirmed.',
      },
    ],
    edge: [
      {
        title: 'Book across a daylight-saving change',
        details: 'A slot on the day the clocks move.',
        expected: 'The time shown is the time meaning to be shown.',
      },
      {
        title: 'Book a slot in the past',
        details: 'Edit the URL or use back navigation to reach an old slot.',
        expected: 'Refused with a sensible message.',
      },
      {
        title: 'Book two slots at the same time in two tabs',
        expected: 'Only one succeeds; the other gets a clear conflict message.',
      },
      {
        title: 'Book at the edge of the booking window',
        details: 'The furthest date allowed, and the day after it.',
        expected: 'The limit is exactly the documented one.',
      },
    ],
  },
  {
    id: 'forms',
    label: 'forms and validation',
    section: 'Forms',
    keywords: ['form', 'validation', 'field', 'input', 'required', 'error message', 'signup', 'sign up', 'register', 'newsletter'],
    ask: 'For the form: which fields are truly required, and which just look required?',
    core: [
      {
        title: 'Submit the form with every field filled correctly',
        expected: 'Saved once, with a confirmation.',
      },
      {
        title: 'Submit with required fields empty',
        expected: 'Errors appear next to the fields and focus moves to the first one.',
      },
      {
        title: 'Revisit a saved form',
        expected: 'Your values are shown back exactly as typed.',
      },
    ],
    edge: [
      {
        title: 'Type a name with an apostrophe or hyphen',
        details: "O'Brien, Anne-Marie.",
        expected: 'Accepted and stored without mangling.',
      },
      {
        title: 'Paste text with a trailing newline',
        expected: 'The value is trimmed sensibly, not rejected.',
      },
      {
        title: 'Fill the form and hit refresh before submitting',
        details: 'If drafts are promised, you should get yours back.',
        expected: 'Behaviour matches whatever is promised to the user.',
      },
      {
        title: 'Submit a field with only whitespace',
        expected: 'Treated as empty.',
      },
    ],
  },
  {
    id: 'upload',
    label: 'uploads and files',
    section: 'Uploads',
    keywords: ['upload', 'file', 'image', 'photo', 'attachment', 'document', 'pdf', 'avatar'],
    ask: 'For uploads: what is the biggest file we should accept, and which types are banned?',
    core: [
      {
        title: 'Upload a normal file of an allowed type',
        expected: 'It appears in the list and can be opened again.',
      },
      {
        title: 'Upload a file that is too large',
        expected: 'Refused before a long wait, with the actual limit stated.',
      },
      {
        title: 'Upload a disallowed file type',
        expected: 'Refused clearly; the file is not silently renamed to fit.',
      },
    ],
    edge: [
      {
        title: 'Upload a file named with emoji or accents',
        expected: 'Stored and downloaded with a sane name.',
      },
      {
        title: 'Upload the same file twice',
        expected: 'A deliberate decision: either a duplicate or a clear replacement.',
      },
      {
        title: 'Upload a file with a double extension',
        details: 'photo.jpg.exe',
        expected: 'Rejected by content, not just by the name.',
      },
      {
        title: 'Cancel the upload midway',
        expected: 'A clear cancelled state; no half-file left behind.',
      },
    ],
  },
  {
    id: 'email',
    label: 'emails and notifications',
    section: 'Notifications',
    keywords: ['email', 'notification', 'notify', 'sms', 'push', 'reminder', 'confirmation email', 'receipt'],
    ask: 'For notifications: which ones must arrive, and which are nice to have?',
    core: [
      {
        title: 'Trigger a notification and wait for it',
        expected: 'It arrives, and the wording matches the action taken.',
      },
      {
        title: 'Open the notification on a phone',
        expected: 'The layout is readable and the links work.',
      },
      {
        title: 'Turn notifications off',
        expected: 'They genuinely stop, including the ones already queued.',
      },
    ],
    edge: [
      {
        title: 'Trigger the same notification twice quickly',
        expected: 'Either two honest messages or one deduplicated one — not a flood.',
      },
      {
        title: 'Open a notification link after signing out',
        expected: 'You are taken to sign in, then to the right place.',
      },
      {
        title: 'Trigger a notification for a deleted record',
        expected: 'No broken link and no crash.',
      },
    ],
  },
  {
    id: 'navigation',
    label: 'navigation and layout',
    section: 'Navigation',
    keywords: ['navigation', 'nav', 'menu', 'link', 'breadcrumb', 'redirect', 'page', 'route', '404', 'back button'],
    ask: 'For navigation: is the browser back button expected to work on every screen?',
    core: [
      {
        title: 'Move through every main screen',
        expected: 'No dead ends; the current location is always obvious.',
      },
      {
        title: 'Use the browser back button',
        expected: 'It returns to the previous screen with the right state.',
      },
      {
        title: 'Visit a URL that does not exist',
        expected: 'A friendly 404 with a way back home.',
      },
    ],
    edge: [
      {
        title: 'Open a deep link while signed out',
        expected: 'Sign in, then land on the linked page.',
      },
      {
        title: 'Refresh on a screen reached by a form post',
        expected: 'No duplicate submission prompt or blank page.',
      },
      {
        title: 'Use the menu with a screen reader or keyboard only',
        expected: 'Everything is reachable and in a sensible order.',
      },
    ],
  },
  {
    id: 'profile',
    label: 'account and profile',
    section: 'Account',
    keywords: ['profile', 'account', 'settings', 'avatar', 'username', 'delete account', 'preferences', 'my details'],
    ask: 'For the account area: what can be edited, and what should be locked?',
    core: [
      {
        title: 'Change a profile detail and save',
        expected: 'The change sticks after a refresh.',
      },
      {
        title: 'Try to use an email already in use',
        expected: 'A clear message; the existing account is untouched.',
      },
      {
        title: 'Cancel an edit before saving',
        expected: 'Nothing is changed.',
      },
    ],
    edge: [
      {
        title: 'Delete the account, then sign in again',
        expected: 'Sign-in is refused and the data is really gone.',
      },
      {
        title: 'Save a profile with empty required details',
        expected: 'Blocked with a helpful message.',
      },
      {
        title: 'Change the email, then use the old one to sign in',
        expected: 'The old email no longer works.',
      },
    ],
  },
  {
    id: 'admin',
    label: 'roles and permissions',
    section: 'Permissions',
    keywords: ['admin', 'permission', 'role', 'access', 'unauthorised', 'unauthorized', 'moderator', 'team'],
    ask: 'For permissions: which role should be blocked from what?',
    core: [
      {
        title: 'Use the app as a normal user',
        expected: 'Admin-only areas are invisible or politely refused.',
      },
      {
        title: 'Try to reach an admin URL directly as a normal user',
        expected: 'Refused by the server, not just hidden in the interface.',
      },
      {
        title: 'Do the main job as each role',
        expected: 'Every role can do what its name promises — and nothing more.',
      },
    ],
    edge: [
      {
        title: 'Change your role mid-session in another tab',
        details: 'Demote a user while they have the app open.',
        expected: 'The change takes effect without a stale privileged session.',
      },
      {
        title: 'Act on a record you no longer have access to',
        expected: 'Refused with a clear message, no partial change.',
      },
    ],
  },
  {
    id: 'data',
    label: 'lists, reports and exports',
    section: 'Data & reports',
    keywords: ['export', 'csv', 'report', 'list', 'table', 'pagination', 'sort', 'import', 'bulk', 'download'],
    ask: 'For the data: what should an empty report look like, and how big can it get?',
    core: [
      {
        title: 'Open the list with a normal amount of data',
        expected: 'Columns line up, totals add up.',
      },
      {
        title: 'Export the data',
        expected: 'The file opens cleanly and the numbers match the screen.',
      },
      {
        title: 'Page or scroll to the end of the list',
        expected: 'The last record is reachable and counted.',
      },
    ],
    edge: [
      {
        title: 'Export with zero rows',
        expected: 'A valid file with headers, or an honest message.',
      },
      {
        title: 'Filter, then export',
        expected: 'Only the filtered rows are exported.',
      },
      {
        title: 'Look at a record with values that could break a CSV',
        details: 'A comma, a quote, a newline, and a leading "=" in one row.',
        expected: 'The file is still valid and safe to open.',
      },
    ],
  },
  {
    id: 'a11y',
    label: 'accessibility',
    section: 'Accessibility',
    keywords: ['accessibility', 'a11y', 'screen reader', 'keyboard', 'contrast', 'focus', 'wcag'],
    ask: 'For accessibility: is keyboard-only use a requirement for this release?',
    core: [
      {
        title: 'Do the main task with the keyboard only',
        details: 'Tab, Shift+Tab, Enter, Space, Escape. No mouse.',
        expected: 'Everything essential is reachable, with a visible focus ring.',
      },
      {
        title: 'Check colour contrast on labels and errors',
        expected: 'Text is readable; status is never carried by colour alone.',
      },
    ],
    edge: [
      {
        title: 'Zoom to 200%',
        expected: 'Nothing important is clipped or hidden.',
      },
      {
        title: 'Use the app with images blocked',
        expected: 'Alt text carries the meaning.',
      },
    ],
  },
  {
    id: 'mobile',
    label: 'phones and tablets',
    section: 'Mobile & responsive',
    keywords: ['mobile', 'phone', 'responsive', 'tablet', 'ios', 'android', 'touch', 'small screen'],
    ask: 'For phones: which screen sizes matter most for the testers?',
    core: [
      {
        title: 'Do the main task on a narrow phone',
        details: 'Around 360 px wide.',
        expected: 'No horizontal scrolling and no tiny tap targets.',
      },
      {
        title: 'Rotate the device mid-task',
        expected: 'Nothing is lost and the layout reflows.',
      },
      {
        title: 'Use the on-screen keyboard over a form',
        expected: 'The field you are typing in stays visible.',
      },
    ],
    edge: [
      {
        title: 'Tap the same button twice quickly',
        expected: 'No double action.',
      },
      {
        title: 'Use the app one-handed at the top of the screen',
        expected: 'Primary actions are reachable.',
      },
    ],
  },
  {
    id: 'performance',
    label: 'speed and load',
    section: 'Performance',
    keywords: ['performance', 'slow', 'speed', 'load time', 'timeout', 'loading', 'lag'],
    ask: 'For speed: what feels too slow to a real tester — two seconds, or five?',
    core: [
      {
        title: 'Load the heaviest screen on a slow connection',
        details: 'Throttle to 3G.',
        expected: 'A loading state appears quickly; nothing looks frozen.',
      },
      {
        title: 'Use the app with a large amount of data',
        expected: 'Scrolling and typing stay responsive.',
      },
    ],
    edge: [
      {
        title: 'Leave a screen open for a long time',
        expected: 'No memory creep, no stale data presented as fresh.',
      },
      {
        title: 'Reload during a slow request',
        expected: 'The app recovers without a half-finished action.',
      },
    ],
  },
  {
    id: 'security',
    label: 'security basics',
    section: 'Security',
    keywords: ['security', 'xss', 'injection', 'token', 'reset link', 'session hijack', 'csrf', 'ssl', 'https'],
    ask: 'For security: is a full penetration test planned, or is this a sanity pass?',
    core: [
      {
        title: 'Paste script tags into a text field',
        details: '<script>alert(1)</script>',
        expected: 'Shown as plain text; nothing executes.',
      },
      {
        title: 'Check that private screens need a signed-in session',
        details: 'Open a private URL in a fresh browser.',
        expected: 'Refused, not merely hidden.',
      },
    ],
    edge: [
      {
        title: 'Reuse a link that should be single-use',
        details: 'Reset links, invite links, one-time codes.',
        expected: 'Refused after first use.',
      },
      {
        title: 'Look for secrets in the page source',
        expected: 'No keys, tokens, or private notes in the shipped bundle.',
      },
    ],
  },
  {
    id: 'errors',
    label: 'errors and offline',
    section: 'Error handling',
    keywords: ['error', 'offline', 'failure', 'crash', 'retry', '500', 'timeout', 'broken'],
    ask: 'When something fails: should the app retry quietly, or always tell the tester?',
    core: [
      {
        title: 'Break the network and use the app',
        expected: 'An honest offline message; no silent data loss.',
      },
      {
        title: 'Make the server return an error',
        details: 'Block the API call in the browser dev tools.',
        expected: 'A readable message with a way to try again.',
      },
    ],
    edge: [
      {
        title: 'Lose the connection halfway through a save',
        expected: 'You can tell whether the save happened.',
      },
      {
        title: 'Retry a failed action several times',
        expected: 'No pile-up of duplicate side effects.',
      },
    ],
  },
]

/* ---------- matching ---------- */

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'of', 'to', 'in', 'on', 'is', 'it', 'its',
  'we', 'our', 'my', 'me', 'that', 'this', 'have', 'has', 'do', 'does', 'can', 'could',
  'should', 'would', 'what', 'which', 'when', 'am', 'i', 'missing', 'add', 'need', 'needs',
  'more', 'some', 'also', 'about', 'site', 'app', 'application', 'project', 'please',
])

export function normalise(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function wildcardMatch(title: string): string {
  // loose key: first four significant words, to catch near-duplicates
  return normalise(title).split(' ').filter((w) => w && !STOP.has(w)).slice(0, 4).join(' ')
}

function toSuggestion(step: DraftStep, fallbackSection: string): Suggestion {
  return {
    key: normalise(step.title),
    title: step.title,
    details: step.details,
    expected: step.expected,
    section: step.section ?? fallbackSection,
  }
}

function detectTopics(text: string): Pack[] {
  const haystack = ' ' + text.toLowerCase() + ' '
  const words = new Set(normalise(text).split(' '))
  const scored = PACKS.map((pack) => {
    let score = 0
    for (const keyword of pack.keywords) {
      if (keyword.includes(' ')) {
        if (haystack.includes(keyword)) score += 3
      } else if (words.has(keyword)) {
        score += 2
      } else if (haystack.includes(keyword)) {
        score += 1
      }
    }
    return { pack, score }
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.map((entry) => entry.pack)
}

/** Is this suggestion already covered by something on the checklist? */
function alreadyHave(suggestion: Suggestion, existingKeys: Set<string>): boolean {
  const key = normalise(suggestion.title)
  if (existingKeys.has(key)) return true
  const loose = wildcardMatch(suggestion.title)
  for (const other of existingKeys) {
    if (!key || !other) continue
    if (other === key) return true
    if (loose && loose === wildcardMatch(other)) return true
  }
  return false
}

/* ---------- the turn ---------- */

export interface ConversationTurn {
  who: 'tester' | 'pencil'
  text: string
}

export interface AssistantRequest {
  input: string
  projectName: string
  brief?: string
  checklistName: string
  /** titles currently on the checklist */
  existingTitles: string[]
  /** topic ids remembered from earlier turns */
  memory: string[]
  /** recent turns, oldest first — used by the optional model backend */
  history?: ConversationTurn[]
}

export interface AssistantReply {
  reply: string
  suggestions: Suggestion[]
  /** a short question the pencil is still chewing on */
  followUp?: string
  quickReplies?: string[]
  /** updated topic memory */
  memory: string[]
  /** number of suggestions that were dropped as duplicates */
  duplicatesSkipped: number
  /** where this reply came from: the local engine, or an optional model */
  source: 'local' | 'model'
  /** set when a model was configured but the call failed and we fell back */
  error?: string
}

export function respond(request: AssistantRequest): AssistantReply {
  const input = request.input.trim()
  const lower = input.toLowerCase()
  const existingKeys = new Set(request.existingTitles.map(normalise))

  const wantsEdge = /\bedge case|edge cases|weird|awkward|corner case|stress|abuse\b/.test(lower)
  const wantsGaps = /\bmissing|what else|gap|gaps|forgot|overlook|cover(ed)?|complete\b/.test(lower)
  const wantsMore = /\bmore|another|keep going|expand|deeper|again\b/.test(lower) && !wantsGaps

  const detected = detectTopics(input)
  const remembered = request.memory
    .map((id) => PACKS.find((pack) => pack.id === id))
    .filter((pack): pack is Pack => Boolean(pack))
  let topics = detected.length > 0 ? detected : remembered

  if (topics.length === 0) {
    // no recognised area — fall back to generic exploration
    topics = []
  }

  /* -- "what am I missing" ---- */
  if (wantsGaps) {
    const scope = topics.slice(0, 2)
    const wanted: Suggestion[] = []
    for (const pack of scope) {
      for (const step of [...pack.core, ...pack.edge]) {
        wanted.push(toSuggestion(step, pack.section))
      }
    }
    const pool = wanted.length > 0 ? wanted : [...genericCore, ...genericEdge].map((s) => toSuggestion(s, 'General'))
    const fresh = pool.filter((s) => !alreadyHave(s, existingKeys))
    const covered = pool.length - fresh.length
    const suggestions = fresh.slice(0, 8)
    const label = scope[0]?.label ?? 'this area'
    let reply: string
    if (fresh.length === 0) {
      reply = `Honestly? ${label} looks well covered from where I'm sitting. I couldn't find a gap in my notes.`
    } else if (suggestions.length === 0 && fresh.length > 0) {
      reply = `Everything I'd add for ${label} is already on this list.`
    } else {
      reply = `Looking at ${label} against what's on "${request.checklistName}": ${covered} of my notes are already covered, and these ${suggestions.length} are still open.`
    }
    return {
      reply,
      suggestions,
      followUp:
        fresh.length > 0
          ? (scope[0]?.ask ?? 'Which of these should I sharpen into a repeatable step?')
          : 'Want me to go a layer deeper: permissions, or errors on that screen?',
      quickReplies: ['Add the edge cases', 'Show a gap for errors too'],
      memory: (scope.length > 0 ? scope : topics).map((p) => p.id),
      duplicatesSkipped: covered,
      source: 'local',
    }
  }

  /* -- "add edge cases for X" ---- */
  if (wantsEdge) {
    const scope = topics.slice(0, 2)
    const pool = (scope.length > 0 ? scope : []).flatMap((pack) =>
      pack.edge.map((step) => toSuggestion(step, 'Edge cases')),
    )
    const base = pool.length > 0 ? pool : genericEdge.map((s) => toSuggestion(s, 'Edge cases'))
    const fresh = base.filter((s) => !alreadyHave(s, existingKeys))
    const suggestions = fresh.slice(0, 8)
    const label = scope[0]?.label ?? 'this flow'
    return {
      reply:
        suggestions.length > 0
          ? `Edge cases for ${label}. These are the ones that usually bite in the last hour before a release.`
          : `Your ${label} list already has the edge cases I'd reach for.`,
      suggestions,
      followUp: scope[0]?.ask,
      quickReplies: ['What am I missing?', 'Add boundary values too'],
      memory: (scope.length > 0 ? scope : topics).map((p) => p.id),
      duplicatesSkipped: base.length - fresh.length,
      source: 'local',
    }
  }

  /* -- "more" ---- */
  if (wantsMore && topics.length > 0) {
    const pool = topics.flatMap((pack) =>
      [...pack.core, ...pack.edge].map((step) => toSuggestion(step, pack.section)),
    )
    const fresh = pool.filter((s) => !alreadyHave(s, existingKeys))
    return {
      reply: `Here's the next layer for ${topics[0].label}. Same rule: nothing gets added unless you say so.`,
      suggestions: fresh.slice(0, 8),
      followUp: topics[0].ask,
      quickReplies: ['Add the edge cases', 'What am I missing?'],
      memory: topics.map((p) => p.id),
      duplicatesSkipped: pool.length - fresh.length,
      source: 'local',
    }
  }

  /* -- describing the project, or asking for a new area ---- */
  const pool = topics.flatMap((pack) =>
    pack.core.map((step) => toSuggestion(step, pack.section)),
  )
  const base = pool.length > 0 ? pool : genericCore.map((s) => toSuggestion(s, 'General'))
  const fresh = base.filter((s) => !alreadyHave(s, existingKeys))
  const suggestions = fresh.slice(0, 7)

  const named = topics.slice(0, 3).map((p) => p.label)
  let reply: string
  if (suggestions.length === 0) {
    reply = `I've already jotted my openers for ${named.join(', ') || 'this'} onto your list — nothing new from me there.`
  } else if (named.length === 0) {
    reply = `Got it. I don't have a page for that area in my notebook yet, so here are some solid openers that apply to almost anything.`
  } else {
    reply = `Noted: ${listOf(named)}. I've pencilled some openers in the margin${
      topics.length > named.length ? ` (and I have notes tucked away for more of it too)` : ''
    }.`
  }

  return {
    reply,
    suggestions,
    followUp:
      topics[0]?.ask ??
      'What breaks most often for your testers — so I can aim my notes there?',
    quickReplies: topics.length > 0
      ? ['Add the edge cases', 'What am I missing?']
      : ['It has a sign-in', 'There are payments', 'There is search'],
    memory: topics.map((p) => p.id),
    duplicatesSkipped: base.length - fresh.length,
    source: 'local',
  }
}

function listOf(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

export const STARTER_BRIEFS = [
  'It is a booking site with login, search and payments',
  'A dashboard where teams manage invoices',
  'A mobile shop with a checkout and returns',
]

export { PACKS }
