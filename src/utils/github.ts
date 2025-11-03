import { Octokit } from "@octokit/rest";
import type {
  GitHubConfig,
  ReleaseInfo,
  CommitInfo,
  PRInfo,
  ChangelogData,
  FileChange,
  EnhancedChangelogData,
} from "../types.js";

export class GitHubService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(config: GitHubConfig) {
    this.octokit = new Octokit({ auth: config.token });
    this.owner = config.owner;
    this.repo = config.repo;
  }

  /**
   * 특정 태그의 릴리즈 정보를 가져옵니다
   */
  async getReleaseByTag(tag: string): Promise<ReleaseInfo | null> {
    try {
      const { data } = await this.octokit.rest.repos.getReleaseByTag({
        owner: this.owner,
        repo: this.repo,
        tag,
      });

      return {
        id: data.id,
        tag_name: data.tag_name,
        name: data.name,
        body: data.body ?? null,
        created_at: data.created_at,
        published_at: data.published_at,
        target_commitish: data.target_commitish,
      };
    } catch (error) {
      console.error(`릴리즈를 찾을 수 없습니다: ${tag}`, error);
      return null;
    }
  }

  /**
   * 최신 릴리즈를 가져옵니다
   */
  async getLatestRelease(): Promise<ReleaseInfo | null> {
    try {
      const { data } = await this.octokit.rest.repos.getLatestRelease({
        owner: this.owner,
        repo: this.repo,
      });

      return {
        id: data.id,
        tag_name: data.tag_name,
        name: data.name,
        body: data.body ?? null,
        created_at: data.created_at,
        published_at: data.published_at,
        target_commitish: data.target_commitish,
      };
    } catch (error) {
      console.error("최신 릴리즈를 찾을 수 없습니다", error);
      return null;
    }
  }

  /**
   * 이전 릴리즈를 찾습니다
   */
  async getPreviousRelease(currentTag: string): Promise<ReleaseInfo | null> {
    try {
      const { data: releases } = await this.octokit.rest.repos.listReleases({
        owner: this.owner,
        repo: this.repo,
        per_page: 100,
      });

      const currentIndex = releases.findIndex((r) => r.tag_name === currentTag);
      if (currentIndex === -1 || currentIndex === releases.length - 1) {
        return null;
      }

      const previous = releases[currentIndex + 1];
      return {
        id: previous.id,
        tag_name: previous.tag_name,
        name: previous.name,
        body: previous.body ?? null,
        created_at: previous.created_at,
        published_at: previous.published_at,
        target_commitish: previous.target_commitish,
      };
    } catch (error) {
      console.error("이전 릴리즈를 찾을 수 없습니다", error);
      return null;
    }
  }

  /**
   * 두 태그 사이의 커밋 목록을 가져옵니다
   */
  async getCommitsBetweenTags(
    baseTag: string | null,
    headTag: string
  ): Promise<CommitInfo[]> {
    try {
      if (!baseTag) {
        // 이전 릴리즈가 없으면 현재 릴리즈의 모든 커밋 가져오기
        const { data } = await this.octokit.rest.repos.listCommits({
          owner: this.owner,
          repo: this.repo,
          sha: headTag,
          per_page: 100,
        });

        return data.map((commit) => ({
          sha: commit.sha,
          commit: {
            message: commit.commit.message,
            author: {
              name: commit.commit.author?.name || "",
              email: commit.commit.author?.email || "",
              date: commit.commit.author?.date || "",
            },
          },
          author: commit.author ? { login: commit.author.login } : null,
          html_url: commit.html_url,
        }));
      }

      const { data } = await this.octokit.rest.repos.compareCommitsWithBasehead(
        {
          owner: this.owner,
          repo: this.repo,
          basehead: `${baseTag}...${headTag}`,
          per_page: 100,
        }
      );

      return data.commits.map((commit) => ({
        sha: commit.sha,
        commit: {
          message: commit.commit.message,
          author: {
            name: commit.commit.author?.name || "",
            email: commit.commit.author?.email || "",
            date: commit.commit.author?.date || "",
          },
        },
        author: commit.author ? { login: commit.author.login } : null,
        html_url: commit.html_url,
      }));
    } catch (error) {
      console.error("커밋 목록을 가져올 수 없습니다", error);
      return [];
    }
  }

  /**
   * 커밋 메시지에서 PR 번호를 추출하고 PR 정보를 가져옵니다
   */
  async getPRsFromCommits(commits: CommitInfo[]): Promise<PRInfo[]> {
    const prNumbers = new Set<number>();
    const prRegex = /#(\d+)/g;

    // 커밋 메시지에서 PR 번호 추출
    for (const commit of commits) {
      const matches = commit.commit.message.matchAll(prRegex);
      for (const match of matches) {
        prNumbers.add(parseInt(match[1], 10));
      }
    }

    // 각 PR의 상세 정보 가져오기
    const prs: PRInfo[] = [];
    for (const prNumber of prNumbers) {
      try {
        const { data } = await this.octokit.rest.pulls.get({
          owner: this.owner,
          repo: this.repo,
          pull_number: prNumber,
        });

        prs.push({
          number: data.number,
          title: data.title,
          body: data.body,
          labels: data.labels.map((label) => ({
            name: typeof label === "string" ? label : label.name || "",
          })),
          html_url: data.html_url,
        });
      } catch (error) {
        console.warn(`PR #${prNumber}를 가져올 수 없습니다`, error);
      }
    }

    return prs;
  }

  /**
   * 릴리즈에 대한 전체 변경사항 데이터를 수집합니다
   */
  async collectChangelogData(currentTag: string): Promise<ChangelogData> {
    console.log(`📊 릴리즈 ${currentTag}에 대한 변경사항 수집 중...`);

    const previousRelease = await this.getPreviousRelease(currentTag);
    const previousTag = previousRelease?.tag_name || null;

    console.log(`📌 이전 릴리즈: ${previousTag || "없음"}`);

    const commits = await this.getCommitsBetweenTags(previousTag, currentTag);
    console.log(`✅ ${commits.length}개의 커밋을 찾았습니다`);

    const prs = await this.getPRsFromCommits(commits);
    console.log(`✅ ${prs.length}개의 Pull Request를 찾았습니다`);

    return {
      commits,
      previousTag,
      currentTag,
      prs,
    };
  }

  /**
   * 커밋의 파일 변경사항을 가져옵니다
   */
  async getCommitFiles(sha: string): Promise<FileChange[]> {
    try {
      const { data } = await this.octokit.rest.repos.getCommit({
        owner: this.owner,
        repo: this.repo,
        ref: sha,
      });

      return (data.files || []).map((file) => ({
        filename: file.filename,
        status: file.status as FileChange["status"],
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
        previous_filename: file.previous_filename,
      }));
    } catch (error) {
      console.warn(`커밋 ${sha}의 파일을 가져올 수 없습니다`, error);
      return [];
    }
  }

  /**
   * 특정 파일의 내용을 가져옵니다
   */
  async getFileContent(path: string, ref: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref,
      });

      // 파일인 경우에만 처리
      if ("content" in data && data.type === "file") {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }

      return null;
    } catch (error) {
      console.warn(`파일 ${path}을 가져올 수 없습니다`, error);
      return null;
    }
  }

  /**
   * 변경된 모든 파일을 분석합니다
   */
  async analyzeChangedFiles(
    commits: CommitInfo[],
    currentTag: string
  ): Promise<FileChange[]> {
    console.log("🔍 파일 변경사항 분석 중...");

    const fileChangesMap = new Map<string, FileChange>();
    const CODE_EXTENSIONS = [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".py",
      ".java",
      ".go",
      ".rs",
      ".rb",
    ];
    const MAX_FILE_SIZE = 1024 * 1024; // 1MB

    // 병렬로 파일 변경사항 수집
    const filePromises = commits.map((commit) =>
      this.getCommitFiles(commit.sha)
    );
    const allFileChanges = await Promise.all(filePromises);

    // 파일 변경사항 병합 및 필터링
    for (const fileChanges of allFileChanges) {
      for (const file of fileChanges) {
        // 코드 파일만 처리
        const isCodeFile = CODE_EXTENSIONS.some((ext) =>
          file.filename.endsWith(ext)
        );
        if (!isCodeFile) continue;

        // 이미 처리한 파일이면 통계만 업데이트
        const existing = fileChangesMap.get(file.filename);
        if (existing) {
          existing.additions += file.additions;
          existing.deletions += file.deletions;
          existing.changes += file.changes;
          // patch는 누적하지 않음 (너무 커질 수 있음)
        } else {
          fileChangesMap.set(file.filename, { ...file });
        }
      }
    }

    // 파일 내용 가져오기 (크기 제한 고려)
    const fileChanges = Array.from(fileChangesMap.values());
    console.log(`📄 ${fileChanges.length}개의 코드 파일이 변경되었습니다`);

    // 상위 20개 파일만 내용 가져오기 (성능 최적화)
    const topFiles = fileChanges
      .sort((a, b) => b.changes - a.changes)
      .slice(0, 20);

    const contentPromises = topFiles.map(async (file) => {
      // 파일이 삭제되지 않은 경우에만 내용 가져오기
      if (file.status !== "removed") {
        const content = await this.getFileContent(file.filename, currentTag);
        if (content && content.length < MAX_FILE_SIZE) {
          file.content = content;
        }
      }
    });

    await Promise.all(contentPromises);

    console.log(
      `✅ ${
        topFiles.filter((f) => f.content).length
      }개 파일의 내용을 가져왔습니다`
    );

    return fileChanges;
  }

  /**
   * 전체 저장소의 코드 파일 목록을 가져옵니다 (RAG 색인용)
   */
  async getAllCodeFiles(ref: string): Promise<FileChange[]> {
    console.log("🌳 전체 코드베이스 파일 트리 가져오는 중...");

    const CODE_EXTENSIONS = [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".py",
      ".java",
      ".go",
      ".rs",
      ".rb",
      ".c",
      ".cpp",
      ".h",
      ".hpp",
      ".cs",
      ".php",
      ".swift",
      ".kt",
      ".scala",
    ];

    const EXCLUDED_PATHS = [
      "node_modules",
      "dist",
      "build",
      ".git",
      ".next",
      "coverage",
      ".cache",
      "vendor",
      "target",
      ".gradle",
      "out",
      "bin",
      "__pycache__",
      ".pytest_cache",
      ".venv",
      "venv",
    ];

    const MAX_FILE_SIZE = 1024 * 1024; // 1MB
    const MAX_FILES = 300; // 최대 100개 파일만 색인

    try {
      // Git Tree API로 전체 파일 트리 가져오기 (recursive=true)
      const { data } = await this.octokit.rest.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: ref,
        recursive: "true",
      });

      // 코드 파일만 필터링
      const codeFiles = data.tree
        .filter((item) => {
          // 파일만 처리 (디렉토리 제외)
          if (item.type !== "blob") return false;

          const path = item.path || "";

          // 제외 경로 체크
          if (EXCLUDED_PATHS.some((excluded) => path.includes(excluded))) {
            return false;
          }

          // 코드 파일 확장자 체크
          return CODE_EXTENSIONS.some((ext) => path.endsWith(ext));
        })
        .slice(0, MAX_FILES * 2); // 파일 크기 필터링을 고려해 여유있게 가져오기

      for (const file of codeFiles) {
        console.log(`📄 ${file.path}`);
      }
      console.log(`📂 ${codeFiles.length}개의 코드 파일을 찾았습니다`);

      // FileChange 형식으로 변환
      const fileChanges: FileChange[] = [];

      // 병렬로 파일 내용 가져오기 (배치 처리)
      const BATCH_SIZE = 10;
      for (
        let i = 0;
        i < codeFiles.length && fileChanges.length < MAX_FILES;
        i += BATCH_SIZE
      ) {
        const batch = codeFiles.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (file) => {
          try {
            const content = await this.getFileContent(file.path!, ref);
            if (content && content.length < MAX_FILE_SIZE) {
              return {
                filename: file.path!,
                status: "modified" as const,
                additions: 0,
                deletions: 0,
                changes: 0,
                content,
              };
            }
          } catch (error) {
            console.warn(`파일 ${file.path} 가져오기 실패:`, error);
          }
          return null;
        });

        const results = await Promise.all(batchPromises);
        const validResults = results.filter(
          (f): f is NonNullable<typeof f> => f !== null
        );
        fileChanges.push(...validResults);

        // 최대 파일 수 도달하면 중단
        if (fileChanges.length >= MAX_FILES) break;
      }

      console.log(`✅ ${fileChanges.length}개 파일의 내용을 가져왔습니다`);
      return fileChanges;
    } catch (error) {
      console.error("전체 파일 트리 가져오기 실패:", error);
      return [];
    }
  }

  /**
   * 향상된 변경사항 데이터를 수집합니다
   */
  async collectEnhancedChangelogData(
    currentTag: string
  ): Promise<EnhancedChangelogData> {
    console.log(`📊 릴리즈 ${currentTag}에 대한 향상된 변경사항 수집 중...`);

    // 기본 변경사항 수집
    const basicData = await this.collectChangelogData(currentTag);

    // 파일 변경사항 분석
    const fileChanges = await this.analyzeChangedFiles(
      basicData.commits,
      currentTag
    );

    return {
      ...basicData,
      fileChanges,
      codeContext: [], // RAG 서비스에서 채워질 예정
    };
  }

  /**
   * 릴리즈 노트를 업데이트합니다
   */
  async updateReleaseNotes(releaseId: number, body: string): Promise<boolean> {
    try {
      await this.octokit.rest.repos.updateRelease({
        owner: this.owner,
        repo: this.repo,
        release_id: releaseId,
        body,
      });

      console.log("✅ 릴리즈 노트가 성공적으로 업데이트되었습니다");
      return true;
    } catch (error) {
      console.error("릴리즈 노트 업데이트 실패", error);
      return false;
    }
  }
}
