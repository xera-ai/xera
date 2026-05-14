const PREFERRED_STORY_IDS = ['description', 'story'];

export interface JiraFieldInfo {
  id: string;
  name: string;
  hasContent: boolean;
}

export function rankStoryCandidates(fields: JiraFieldInfo[]): JiraFieldInfo[] {
  return fields
    .filter((f) => f.hasContent)
    .filter(
      (f) => !['attachment', 'comment', 'created', 'updated', 'reporter', 'creator'].includes(f.id),
    )
    .sort((a, b) => {
      const ai = PREFERRED_STORY_IDS.indexOf(a.id);
      const bi = PREFERRED_STORY_IDS.indexOf(b.id);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.id.localeCompare(b.id);
    });
}
