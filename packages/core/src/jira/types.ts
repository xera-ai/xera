export interface JiraTicket {
  key: string;
  summary: string;
  story: string;
  acceptanceCriteria?: string;
  attachments: Array<{ filename: string; url: string }>;
  raw: Record<string, unknown>;
}

export interface JiraFieldMap {
  story: string;
  acceptanceCriteria?: string;
}

export interface JiraClient {
  readonly backend: 'mcp' | 'rest';
  fetchTicket(key: string, fields: JiraFieldMap): Promise<JiraTicket>;
  postComment(key: string, body: string): Promise<{ id: string }>;
  transitionStatus(key: string, statusName: string): Promise<void>;
  listFields(sampleKey: string): Promise<Array<{ id: string; name: string; hasContent: boolean }>>;
}
