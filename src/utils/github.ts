import { Octokit } from "@octokit/rest";
import type {
  GitHubConfig,
  ReleaseInfo,
  CommitInfo,
  PRInfo,
  ChangelogData,
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
