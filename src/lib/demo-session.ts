/**
 * Demo sign-in for local mode (real sign-in switched off). Nothing is checked: it only remembers, in this
 * browser, that someone went through the sign-in screen and which email they typed. Passwords are never
 * stored or sent anywhere.
 */
const KEY = 'app.demoSignIn'

export function readDemoEmail(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function writeDemoEmail(email: string | null) {
  try {
    if (email) localStorage.setItem(KEY, email)
    else localStorage.removeItem(KEY)
  } catch {
    /* private window: the demo sign-in just won't be remembered */
  }
}
