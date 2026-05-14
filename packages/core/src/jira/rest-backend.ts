import type { JiraClient, JiraFieldMap, JiraTicket } from './types';

interface RestCreds { email: string; apiToken: string; }

export function createRestBackend(baseUrl: string, creds: RestCreds): JiraClient {
  const authHeader = `Basic ${Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64')}`;
  const base = baseUrl.replace(/\/$/, '');

  async function req(path: string, init?: RequestInit): Promise<Response> {
    const r = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!r.ok && r.status !== 201) {
      throw new Error(`Jira REST ${init?.method ?? 'GET'} ${path} failed: ${r.status} ${await r.text()}`);
    }
    return r;
  }

  return {
    backend: 'rest',
    async fetchTicket(key, fields): Promise<JiraTicket> {
      const want = ['summary', fields.story];
      if (fields.acceptanceCriteria) want.push(fields.acceptanceCriteria);
      want.push('attachment');
      const r = await req(`/rest/api/3/issue/${encodeURIComponent(key)}?fields=${want.join(',')}`);
      const json = (await r.json()) as { key: string; fields: Record<string, unknown> };
      const f = json.fields;
      const attachments = Array.isArray(f.attachment)
        ? (f.attachment as Array<{ filename: string; content: string }>).map(a => ({ filename: a.filename, url: a.content }))
        : [];
      return {
        key: json.key,
        summary: String(f.summary ?? ''),
        story: String(f[fields.story] ?? ''),
        acceptanceCriteria: fields.acceptanceCriteria ? String(f[fields.acceptanceCriteria] ?? '') : undefined,
        attachments,
        raw: f,
      };
    },
    async postComment(key, body) {
      const r = await req(`/rest/api/3/issue/${encodeURIComponent(key)}/comment`, {
        method: 'POST',
        body: JSON.stringify({
          body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] },
        }),
      });
      const json = (await r.json()) as { id: string };
      return { id: json.id };
    },
    async transitionStatus(key, statusName) {
      const tr = await req(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`);
      const json = (await tr.json()) as { transitions: Array<{ id: string; name: string }> };
      const t = json.transitions.find(x => x.name === statusName);
      if (!t) throw new Error(`No transition named "${statusName}" available for ${key}`);
      await req(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
        method: 'POST',
        body: JSON.stringify({ transition: { id: t.id } }),
      });
    },
    async listFields(sampleKey) {
      const r = await req(`/rest/api/3/issue/${encodeURIComponent(sampleKey)}?fields=*all`);
      const json = (await r.json()) as { fields: Record<string, unknown> };
      return Object.entries(json.fields).map(([id, value]) => ({
        id,
        name: id,
        hasContent: value !== null && value !== undefined && value !== '',
      }));
    },
  };
}
