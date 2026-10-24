export function proposalActivityDescriptionForDisplay(
  description: string,
  nextAction?: string | null,
  followUpAt?: string | null,
) {
  return description
    .split(/\r?\n/)
    .filter((line) => {
      const trimmedLine = line.trim();
      if (/^next action:\s*/i.test(trimmedLine) && nextAction) return false;
      if (/^follow-up:\s*/i.test(trimmedLine) && followUpAt) return false;
      return true;
    })
    .join("\n");
}
