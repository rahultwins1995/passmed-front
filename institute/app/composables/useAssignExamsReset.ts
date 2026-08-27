// Shared signal between Sidebar and assign-exams page.
// Sidebar increments it → page watches it → resets to default state.
// No URL query strings needed.
export const useAssignExamsReset = () =>
  useState<number>('assign-exams-reset', () => 0)
