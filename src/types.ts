export interface ReleaseInfo {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null | undefined;
  created_at: string;
  published_at: string | null;
  target_commitish: string;
}

export interface CommitInfo {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
  };
  author: {
    login?: string;
  } | null;
  html_url: string;
}

export interface PRInfo {
  number: number;
  title: string;
  body: string | null;
  labels: Array<{ name: string }>;
  html_url: string;
}

export interface ChangelogData {
  commits: CommitInfo[];
  previousTag: string | null;
  currentTag: string;
  prs: PRInfo[];
}

export interface GeneratedChangelog {
  summary: string;
  features: string[];
  fixes: string[];
  breaking: string[];
  other: string[];
}

export interface GitHubConfig {
  owner: string;
  repo: string;
  token: string;
}

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

