/**
 * github.js — saving the site back to its own repository.
 *
 * The Studio has no server. When you publish, your browser talks straight to
 * the GitHub API with a token that only you hold, and writes one commit that
 * contains every file you changed. GitHub Pages then rebuilds the site.
 */

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export class GitHubClient {
  /** @param {{token: string, owner: string, repo: string, branch?: string}} options */
  constructor({ token, owner, repo, branch = '' }) {
    Object.assign(this, { token, owner, repo, branch });
  }

  get base() { return `${API}/repos/${this.owner}/${this.repo}`; }

  async api(path, { method = 'GET', body, raw = false } = {}) {
    const res = await fetch(path.startsWith('http') ? path : this.base + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch { /* no body */ }
      throw new GitHubError(GitHubClient.explain(res.status, detail), res.status);
    }
    return raw ? res.text() : res.status === 204 ? null : res.json();
  }

  static explain(status, detail) {
    if (status === 401) return 'GitHub did not accept the token. It may have expired or been mistyped.';
    if (status === 403) return `GitHub refused: ${detail || 'the token is not allowed to write to this repository.'}`;
    if (status === 404) return 'GitHub could not find that repository with this token. Check the owner and name, and that the token includes this repository.';
    if (status === 409 || status === 422) return `GitHub could not apply the change: ${detail}`;
    return `GitHub returned ${status}. ${detail}`;
  }

  /** Check the token works and can write. Also learns the default branch. */
  async check() {
    const info = await this.api('');
    if (!this.branch) this.branch = info.default_branch;
    if (info.permissions && !info.permissions.push) throw new GitHubError('The token can read this repository but not write to it. It needs "Contents: Read and write".', 403);
    return { name: info.full_name, branch: this.branch, private: info.private };
  }

  /** Read a text file as it is in the repository right now (not as deployed). */
  async read(path) {
    if (!this.branch) await this.check();
    return this.api(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(this.branch)}`, { raw: true });
  }

  /**
   * Write several files in a single commit.
   * @param {string} message
   * @param {{path: string, text?: string, base64?: string, remove?: boolean}[]} changes
   */
  async commit(message, changes) {
    if (!this.branch) await this.check();
    const ref = await this.api(`/git/ref/heads/${this.branch}`);
    const parent = ref.object.sha;
    const head = await this.api(`/git/commits/${parent}`);
    const tree = [];
    for (const change of changes) {
      if (change.remove) { tree.push({ path: change.path, mode: '100644', type: 'blob', sha: null }); continue; }
      const blob = await this.api('/git/blobs', {
        method: 'POST',
        body: change.base64 != null ? { content: change.base64, encoding: 'base64' } : { content: change.text, encoding: 'utf-8' },
      });
      tree.push({ path: change.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const next = await this.api('/git/trees', { method: 'POST', body: { base_tree: head.tree.sha, tree } });
    const commit = await this.api('/git/commits', { method: 'POST', body: { message, tree: next.sha, parents: [parent] } });
    await this.api(`/git/refs/heads/${this.branch}`, { method: 'PATCH', body: { sha: commit.sha } });
    return { sha: commit.sha, url: `https://github.com/${this.owner}/${this.repo}/commit/${commit.sha}` };
  }
}
