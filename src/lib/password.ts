/**
 * The staff password policy, in one place: the server builds its validation
 * schema from these rules and the Add User form ticks them off as you type, so
 * what's enforced and what's shown can never drift apart.
 *
 * Only applies when a password is SET. Sign-in compares hashes and never checks
 * the format, so accounts created before this policy keep working.
 */
export const PASSWORD_MIN = 12;

/** bcrypt silently ignores anything past 72 bytes. */
export const PASSWORD_MAX = 72;

export const PASSWORD_RULES: { label: string; pattern: RegExp; error: string }[] = [
  {
    label: "Uppercase letter (A-Z)",
    pattern: /[A-Z]/,
    error: "Password needs an uppercase letter.",
  },
  {
    label: "Lowercase letter (a-z)",
    pattern: /[a-z]/,
    error: "Password needs a lowercase letter.",
  },
  {
    label: "Number (0-9)",
    pattern: /[0-9]/,
    error: "Password needs a number.",
  },
  {
    label: "Symbol (! @ # $ …)",
    pattern: /[^A-Za-z0-9]/,
    error: "Password needs a symbol (for example ! @ # $).",
  },
];
