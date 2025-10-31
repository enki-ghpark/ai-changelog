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

export interface FileChange {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  changes: number;
  patch?: string; // diff 내용
  content?: string; // 전체 파일 내용
  previous_filename?: string; // 이름 변경 시 이전 파일명
}

export interface ChangelogData {
  commits: CommitInfo[];
  previousTag: string | null;
  currentTag: string;
  prs: PRInfo[];
}

export interface EnhancedChangelogData extends ChangelogData {
  fileChanges: FileChange[];
  codeContext: string[]; // RAG로 검색된 관련 코드
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
  embeddingModel?: string; // 임베딩 모델 (기본값: nomic-embed-text)
}

export interface RAGConfig {
  ollamaBaseUrl: string;
  embeddingModel: string;
  chunkSize: number; // 청크 크기 (토큰 단위)
  chunkOverlap: number; // 청크 오버랩
  topK: number; // 검색할 관련 문서 수
}

