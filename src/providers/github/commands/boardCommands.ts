// GraphQL query strings for Projects V2 board operations — GitHub forge adapter (#792).
const QUERY_PROJECT =
  `query($owner:String!,$repo:String!){repository(owner:$owner,name:$repo){projectsV2(first:1){nodes{id}}}}`;
const QUERY_ITEM =
  `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){issue(number:$number){projectItems(first:50){nodes{id project{id} fieldValueByName(name:"Status"){...on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}`;
const QUERY_FIELD =
  `query($projectId:ID!){node(id:$projectId){...on ProjectV2{field(name:"Status"){...on ProjectV2SingleSelectField{id options{id name}}}}}}`;
const MUTATION_MOVE =
  `mutation($projectId:ID!,$itemId:ID!,$fieldId:ID!,$optionId:String!){updateProjectV2ItemFieldValue(input:{projectId:$projectId itemId:$itemId fieldId:$fieldId value:{singleSelectOptionId:$optionId}}){projectV2Item{id}}}`;

// ── Command builders ───────────────────────────────────────────────────────

export function graphQLInputCmd(): string[] {
  return ['gh', 'api', 'graphql', '--input', '-'];
}

// -F types a value (a number here); -f always sends a string.
export function graphQLCmd(query: string, variables?: Record<string, string | number>): string[] {
  return [
    'gh', 'api', 'graphql', '-f', `query=${query}`,
    ...Object.entries(variables ?? {}).flatMap(([key, value]) =>
      typeof value === 'number' ? ['-F', `${key}=${value}`] : ['-f', `${key}=${value}`]),
  ];
}

export function projectQueryCmd(owner: string, repo: string): string[] {
  return graphQLCmd(QUERY_PROJECT, { owner, repo });
}

export function itemQueryCmd(owner: string, repo: string, issueNumber: number): string[] {
  return graphQLCmd(QUERY_ITEM, { owner, repo, number: issueNumber });
}

export function fieldQueryCmd(projectId: string): string[] {
  return graphQLCmd(QUERY_FIELD, { projectId });
}

export function moveStatusCmd(projectId: string, itemId: string, fieldId: string, optionId: string): string[] {
  return graphQLCmd(MUTATION_MOVE, { projectId, itemId, fieldId, optionId });
}

// ── Response parsers ───────────────────────────────────────────────────────

export function parseProjectId(result: string): string | null {
  const parsed = JSON.parse(result) as {
    data?: { repository?: { projectsV2?: { nodes?: Array<{ id: string }> } } };
  };
  const nodes = parsed?.data?.repository?.projectsV2?.nodes;
  return (nodes && nodes.length > 0) ? nodes[0].id : null;
}

export function parseIssueItem(
  result: string,
  projectId: string,
): { itemId: string; currentStatus: string | null } | null {
  const parsed = JSON.parse(result) as {
    data?: { repository?: { issue?: { projectItems?: { nodes?: Array<{
      id: string;
      project: { id: string };
      fieldValueByName: { name: string } | null;
    }> } } } };
  };
  const items = parsed?.data?.repository?.issue?.projectItems?.nodes ?? [];
  const match = items.find((item) => item.project.id === projectId);
  if (!match) return null;
  return { itemId: match.id, currentStatus: match.fieldValueByName?.name ?? null };
}

/**
 * Returns:
 *   { fieldId, optionId } — proceed with the mutation
 *   'already_at_status'   — fuzzy-resolved option name matches current status; no-op
 *   null                  — no matching option found
 */
export function parseStatusField(
  result: string,
  targetStatus: string,
  currentStatus: string | null,
): { fieldId: string; optionId: string } | 'already_at_status' | null {
  const parsed = JSON.parse(result) as {
    data?: { node?: { field?: { id: string; options: Array<{ id: string; name: string }> } | null } };
  };
  const field = parsed?.data?.node?.field;
  if (!field) return null;
  const target = targetStatus.toLowerCase();
  const exact = field.options.find((o) => o.name.toLowerCase() === target);
  const fuzzy = field.options.find((o) => o.name.toLowerCase().includes(target));
  const matched = exact ?? fuzzy ?? null;
  if (!matched) return null;
  if (currentStatus?.toLowerCase() === matched.name.toLowerCase()) return 'already_at_status';
  return { fieldId: field.id, optionId: matched.id };
}
