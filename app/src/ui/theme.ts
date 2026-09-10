/**
 * Visual tokens for an older-adult interface.
 *
 * Every value here has a reason, and the reasons come from the population this
 * instrument is for: community-dwelling adults aged 60+, some with cataracts,
 * yellowed lenses, or reduced fine motor control.
 */

export const colours = {
  /**
   * Warm off-white rather than pure white. A yellowed lens scatters short
   * wavelengths, so a bright white field reads as glare. The warm ground keeps
   * contrast high without the glare.
   */
  ground: '#FFFBF2',

  /** Charcoal rather than black: ~7:1 on the ground, WCAG AAA for body text. */
  ink: '#1A1A1A',
  inkMuted: '#5A5348',

  /**
   * Kopi amber for the active surface. Deliberately not blue — blue
   * discrimination declines with age, so blue is a poor carrier of meaning.
   */
  amber: '#C77B30',
  amberBright: '#E8A24A',
  amberSoft: '#F5E3CC',

  /** For a pad that is present but not the one to use. */
  dormant: '#E4DCCD',
} as const;

/**
 * Type scale. Larger than a general-purpose app throughout: the smallest text
 * anywhere in the participant flow is 20.
 */
export const type = {
  headline: 40,
  title: 32,
  body: 24,
  small: 20,
} as const;

export const layout = {
  /**
   * Minimum size for any non-play control, roughly 1.5x the WCAG 2.5.5
   * guidance of 44 — appropriate for reduced fine motor control.
   */
  minTouch: 72,
  gutter: 24,
  padGap: 32,
  radius: 20,
} as const;
