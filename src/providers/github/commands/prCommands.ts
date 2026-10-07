// gh CLI argv builders for PR list/create/merge/review operations — GitHub forge adapter (#792).

export function findPRByBranchCmd(owner: string, repo: string, branchName: string): string[] {
  return [
    'gh', 'pr', 'list', '--repo', `${owner}/${repo}`, '--head', branchName, '--state', 'all',
    '--json', 'number,state,headRefName,baseRefName,updatedAt,labels', '--limit', '20',
  ];
}

export function fetchPRDetailsCmd(owner: string, repo: string, prNumber: number): string[] {
  return [
    'gh', 'pr', 'view', String(prNumber), '--repo', `${owner}/${repo}`,
    '--json', 'number,title,body,state,headRefName,baseRefName,url',
  ];
}

export function fetchPRReviewsCmd(owner: string, repo: string, prNumber: number): string[] {
  return ['gh', 'api', `repos/${owner}/${repo}/pulls/${prNumber}/reviews`, '--paginate'];
}

export function fetchPRReviewCommentsCmd(owner: string, repo: string, prNumber: number): string[] {
  return ['gh', 'api', `repos/${owner}/${repo}/pulls/${prNumber}/comments`, '--paginate'];
}

export function commentOnPRCmd(owner: string, repo: string, prNumber: number): string[] {
  return ['gh', 'pr', 'comment', String(prNumber), '--repo', `${owner}/${repo}`, '--body-file', '-'];
}

export function mergePRCmd(owner: string, repo: string, prNumber: number): string[] {
  return ['gh', 'pr', 'merge', String(prNumber), '--merge', '--repo', `${owner}/${repo}`];
}

export function approvePRCmd(owner: string, repo: string, prNumber: number): string[] {
  return ['gh', 'pr', 'review', String(prNumber), '--approve', '--repo', `${owner}/${repo}`];
}

export function prApprovalStateCmd(owner: string, repo: string, prNumber: number): string[] {
  return ['gh', 'pr', 'view', String(prNumber), '--repo', `${owner}/${repo}`, '--json', 'reviewDecision,reviews'];
}

export function fetchPRListCmd(owner: string, repo: string): string[] {
  return ['gh', 'pr', 'list', '--repo', `${owner}/${repo}`, '--state', 'open', '--json', 'number,headRefName,updatedAt'];
}

export function fetchAllPRsCmd(owner: string, repo: string): string[] {
  return [
    'gh', 'pr', 'list', '--repo', `${owner}/${repo}`, '--state', 'all',
    '--json', 'number,body,state,mergedAt,updatedAt,url', '--limit', '200',
  ];
}

export function prChangedFilesCmd(owner: string, repo: string, prNumber: number): string[] {
  return ['gh', 'pr', 'view', String(prNumber), '--repo', `${owner}/${repo}`, '--json', 'files'];
}

export function createPRCmd(owner: string, repo: string, title: string, headBranch: string, baseBranch?: string, labels?: readonly string[]): string[] {
  return [
    'gh', 'pr', 'create', '--repo', `${owner}/${repo}`,
    '--title', title,
    // --head must be explicit: gh otherwise infers it from the cwd's current
    // branch (the context base path, on the default branch), producing an
    // empty-diff PR against the wrong head.
    '--head', headBranch,
    '--body-file', '-',
    ...(baseBranch ? ['--base', baseBranch] : []),
    ...(labels ?? []).flatMap((label) => ['--label', label]),
  ];
}

export function fetchMergedPRsCmd(owner: string, repo: string, limit = 200): string[] {
  return ['gh', 'pr', 'list', '--repo', `${owner}/${repo}`, '--state', 'merged', '--json', 'body,mergedAt', '--limit', String(limit)];
}
