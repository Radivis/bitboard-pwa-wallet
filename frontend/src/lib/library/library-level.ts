/** Specialization of a library article. A narrower topic sits above the Bitcoin topic it builds on. */
export const LIBRARY_LEVELS = [1, 2, 3, 4, 5] as const

export type LibraryLevel = (typeof LIBRARY_LEVELS)[number]

export const LIBRARY_LEVEL_LABEL: Record<LibraryLevel, string> = {
  1: 'Beginner',
  2: 'Intermediate',
  3: 'Advanced',
  4: 'Expert',
  5: 'Specialist',
}
