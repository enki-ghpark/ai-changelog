import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubService } from './github.js';
import type { GitHubConfig } from '../types.js';

// Octokit 모킹
vi.mock('@octokit/rest', () => {
  return {
    Octokit: vi.fn().mockImplementation(() => {
      return {
        rest: {
          repos: {
            getReleaseByTag: vi.fn(),
            getLatestRelease: vi.fn(),
            listReleases: vi.fn(),
            compareCommitsWithBasehead: vi.fn(),
            listCommits: vi.fn(),
            updateRelease: vi.fn(),
          },
          pulls: {
            get: vi.fn(),
          },
        },
      };
    }),
  };
});

describe('GitHubService', () => {
  let githubService: GitHubService;
  let mockOctokit: any;

  beforeEach(() => {
    const config: GitHubConfig = {
      owner: 'test-owner',
      repo: 'test-repo',
      token: 'test-token',
    };
    githubService = new GitHubService(config);
    mockOctokit = (githubService as any).octokit;
  });

  describe('getReleaseByTag', () => {
    it('태그로 릴리즈를 성공적으로 가져와야 함', async () => {
      const mockRelease = {
        id: 1,
        tag_name: 'v1.0.0',
        name: 'Release 1.0.0',
        body: 'Test release',
        created_at: '2024-01-01T00:00:00Z',
        published_at: '2024-01-01T00:00:00Z',
        target_commitish: 'main',
      };

      mockOctokit.rest.repos.getReleaseByTag.mockResolvedValue({ data: mockRelease });

      const result = await githubService.getReleaseByTag('v1.0.0');

      expect(result).toEqual(mockRelease);
      expect(mockOctokit.rest.repos.getReleaseByTag).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        tag: 'v1.0.0',
      });
    });

    it('릴리즈를 찾을 수 없을 때 null을 반환해야 함', async () => {
      mockOctokit.rest.repos.getReleaseByTag.mockRejectedValue(new Error('Not found'));

      const result = await githubService.getReleaseByTag('v1.0.0');

      expect(result).toBeNull();
    });
  });

  describe('getPreviousRelease', () => {
    it('이전 릴리즈를 성공적으로 찾아야 함', async () => {
      const mockReleases = [
        { id: 2, tag_name: 'v1.0.1', name: 'Release 1.0.1', body: null, created_at: '2024-01-02T00:00:00Z', published_at: '2024-01-02T00:00:00Z', target_commitish: 'main' },
        { id: 1, tag_name: 'v1.0.0', name: 'Release 1.0.0', body: null, created_at: '2024-01-01T00:00:00Z', published_at: '2024-01-01T00:00:00Z', target_commitish: 'main' },
      ];

      mockOctokit.rest.repos.listReleases.mockResolvedValue({ data: mockReleases });

      const result = await githubService.getPreviousRelease('v1.0.1');

      expect(result).toEqual({
        id: 1,
        tag_name: 'v1.0.0',
        name: 'Release 1.0.0',
        body: null,
        created_at: '2024-01-01T00:00:00Z',
        published_at: '2024-01-01T00:00:00Z',
        target_commitish: 'main',
      });
    });

    it('이전 릴리즈가 없을 때 null을 반환해야 함', async () => {
      const mockReleases = [
        { id: 1, tag_name: 'v1.0.0', name: 'Release 1.0.0', body: null, created_at: '2024-01-01T00:00:00Z', published_at: '2024-01-01T00:00:00Z', target_commitish: 'main' },
      ];

      mockOctokit.rest.repos.listReleases.mockResolvedValue({ data: mockReleases });

      const result = await githubService.getPreviousRelease('v1.0.0');

      expect(result).toBeNull();
    });
  });

  describe('getCommitsBetweenTags', () => {
    it('두 태그 사이의 커밋을 가져와야 함', async () => {
      const mockCommits = [
        {
          sha: 'abc123',
          commit: {
            message: 'Test commit',
            author: { name: 'Test User', email: 'test@example.com', date: '2024-01-01T00:00:00Z' },
          },
          author: { login: 'testuser' },
          html_url: 'https://github.com/test/commit/abc123',
        },
      ];

      mockOctokit.rest.repos.compareCommitsWithBasehead.mockResolvedValue({
        data: { commits: mockCommits },
      });

      const result = await githubService.getCommitsBetweenTags('v1.0.0', 'v1.0.1');

      expect(result).toHaveLength(1);
      expect(result[0].sha).toBe('abc123');
    });

    it('baseTag가 없을 때 모든 커밋을 가져와야 함', async () => {
      const mockCommits = [
        {
          sha: 'abc123',
          commit: {
            message: 'Test commit',
            author: { name: 'Test User', email: 'test@example.com', date: '2024-01-01T00:00:00Z' },
          },
          author: { login: 'testuser' },
          html_url: 'https://github.com/test/commit/abc123',
        },
      ];

      mockOctokit.rest.repos.listCommits.mockResolvedValue({ data: mockCommits });

      const result = await githubService.getCommitsBetweenTags(null, 'v1.0.0');

      expect(result).toHaveLength(1);
      expect(mockOctokit.rest.repos.listCommits).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        sha: 'v1.0.0',
        per_page: 100,
      });
    });
  });

  describe('getPRsFromCommits', () => {
    it('커밋 메시지에서 PR 번호를 추출하고 PR 정보를 가져와야 함', async () => {
      const mockCommits = [
        {
          sha: 'abc123',
          commit: {
            message: 'Fix bug (#123)',
            author: { name: 'Test User', email: 'test@example.com', date: '2024-01-01T00:00:00Z' },
          },
          author: { login: 'testuser' },
          html_url: 'https://github.com/test/commit/abc123',
        },
      ];

      const mockPR = {
        number: 123,
        title: 'Fix bug',
        body: 'This fixes the bug',
        labels: [{ name: 'bug' }],
        html_url: 'https://github.com/test/pull/123',
      };

      mockOctokit.rest.pulls.get.mockResolvedValue({ data: mockPR });

      const result = await githubService.getPRsFromCommits(mockCommits);

      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(123);
      expect(result[0].title).toBe('Fix bug');
    });

    it('PR이 없을 때 빈 배열을 반환해야 함', async () => {
      const mockCommits = [
        {
          sha: 'abc123',
          commit: {
            message: 'Regular commit without PR',
            author: { name: 'Test User', email: 'test@example.com', date: '2024-01-01T00:00:00Z' },
          },
          author: { login: 'testuser' },
          html_url: 'https://github.com/test/commit/abc123',
        },
      ];

      const result = await githubService.getPRsFromCommits(mockCommits);

      expect(result).toHaveLength(0);
    });
  });

  describe('updateReleaseNotes', () => {
    it('릴리즈 노트를 성공적으로 업데이트해야 함', async () => {
      mockOctokit.rest.repos.updateRelease.mockResolvedValue({});

      const result = await githubService.updateReleaseNotes(1, 'New body');

      expect(result).toBe(true);
      expect(mockOctokit.rest.repos.updateRelease).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        release_id: 1,
        body: 'New body',
      });
    });

    it('업데이트 실패 시 false를 반환해야 함', async () => {
      mockOctokit.rest.repos.updateRelease.mockRejectedValue(new Error('Update failed'));

      const result = await githubService.updateReleaseNotes(1, 'New body');

      expect(result).toBe(false);
    });
  });
});

