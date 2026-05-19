export interface IssueTicket {
  key: string;
  summary: string;
  story: string;
  acceptanceCriteria?: string;
  attachments: Array<{ filename: string; url: string }>;
}

export interface IssueProvider {
  readonly backend: string;
  fetchTicket(key: string): Promise<IssueTicket>;
  postComment(key: string, body: string): Promise<{ id: string }>;
}
