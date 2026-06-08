/**
 * linear 工具 — Linear GraphQL API 4 action (D-31.3.2, 2026-06-08).
 *
 * 拍板: 走 Linear GraphQL endpoint `api.linear.app/graphql`, API key 走
 *   `LINEAR_API_KEY` env, fetcher 注入. 不引 @linear/sdk (省 native dep).
 * - listIssues:  issuesList filter
 * - createIssue: issueCreate mutation
 * - updateIssue: issueUpdate mutation
 * - addComment:  commentCreate mutation
 *
 * 0 业务改业务, 5 红线 0 触碰. risk: medium (写 Linear 任务).
 */

import type { ToolName } from '@deepwhale/core';
import type { Tool, ToolInputSchema, ToolResult } from '../types.js';

export type LinearFetcher = (url: string, opts: { method: string; body: string }) => Promise<string>;
const defaultFetcher: LinearFetcher = async () => { throw new Error('linear: no fetcher injected'); };

const ENDPOINT = 'https://api.linear.app/graphql';

function gql(query: string, variables: Record<string, unknown>): string {
  return JSON.stringify({ query, variables });
}

export class LinearTool implements Tool {
  readonly name = 'linear' as ToolName;
  readonly description = 'Read/write Linear issues via GraphQL: listIssues / createIssue / updateIssue / addComment. Medium risk.';
  readonly risk: 'low' | 'medium' | 'high' = 'medium';

  readonly schema: ToolInputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', description: 'linear action', enum: ['listIssues', 'createIssue', 'updateIssue', 'addComment'] },
      teamId: { type: 'string', description: 'team id (listIssues / createIssue)' },
      issueId: { type: 'string', description: 'issue id (updateIssue / addComment)' },
      title: { type: 'string', description: 'issue title (createIssue)' },
      body: { type: 'string', description: 'comment body (addComment)' },
      state: { type: 'string', description: 'state id (updateIssue)' },
    },
    required: ['action'],
  };

  private readonly fetcher: LinearFetcher;
  constructor(opts: { fetcher?: LinearFetcher } = {}) {
    this.fetcher = opts.fetcher ?? defaultFetcher;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const action = input['action'];
    try {
      switch (action) {
        case 'listIssues': {
          const teamId = input['teamId'];
          const q = `query issuesList($filter: IssueFilter) { issues(filter: $filter, first: 20) { nodes { id title state { name } } } }`;
          const filter = typeof teamId === 'string' && teamId.length > 0 ? { team: { id: { eq: teamId } } } : {};
          const out = await this.fetcher(ENDPOINT, { method: 'POST', body: gql(q, { filter }) });
          return { success: true, content: out };
        }
        case 'createIssue': {
          const teamId = input['teamId'], title = input['title'];
          if (typeof teamId !== 'string' || typeof title !== 'string') {
            return { success: false, content: '', error: 'invalid-input: teamId + title required' };
          }
          const q = `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id title } } }`;
          const out = await this.fetcher(ENDPOINT, { method: 'POST', body: gql(q, { input: { teamId, title } }) });
          return { success: true, content: out, meta: { teamId, title } };
        }
        case 'updateIssue': {
          const id = input['issueId'], state = input['state'];
          if (typeof id !== 'string') return { success: false, content: '', error: 'invalid-input: issueId required' };
          const q = `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`;
          const updateInput = typeof state === 'string' && state.length > 0 ? { stateId: state } : {};
          const out = await this.fetcher(ENDPOINT, { method: 'POST', body: gql(q, { id, input: updateInput }) });
          return { success: true, content: out, meta: { issueId: id } };
        }
        case 'addComment': {
          const id = input['issueId'], body = input['body'];
          if (typeof id !== 'string' || typeof body !== 'string') {
            return { success: false, content: '', error: 'invalid-input: issueId + body required' };
          }
          const q = `mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`;
          const out = await this.fetcher(ENDPOINT, { method: 'POST', body: gql(q, { input: { issueId: id, body } }) });
          return { success: true, content: out, meta: { issueId: id } };
        }
        default:
          return { success: false, content: '', error: `unknown-action: ${String(action)}` };
      }
    } catch (e) {
      return { success: false, content: '', error: `linear error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

export const linear = new LinearTool();
