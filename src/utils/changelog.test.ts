import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChangelogGenerator } from "./changelog.js";
import type { ChangelogData, OllamaConfig } from "../types.js";

// LangChain Ollama 모킹
vi.mock("@langchain/ollama", () => {
  return {
    Ollama: vi.fn().mockImplementation(() => {
      return {
        invoke: vi.fn(),
      };
    }),
  };
});

describe("ChangelogGenerator", () => {
  let changelogGenerator: ChangelogGenerator;
  let mockLLM: any;

  beforeEach(() => {
    const config: OllamaConfig = {
      baseUrl: "http://localhost:11434",
      model: "llama3.1:latest",
    };
    changelogGenerator = new ChangelogGenerator(config);
    mockLLM = (changelogGenerator as any).llm;
  });

  const mockChangelogData: ChangelogData = {
    commits: [
      {
        sha: "abc123",
        commit: {
          message: "feat: Add new feature",
          author: {
            name: "Test User",
            email: "test@example.com",
            date: "2024-01-01T00:00:00Z",
          },
        },
        author: { login: "testuser" },
        html_url: "https://github.com/test/commit/abc123",
      },
      {
        sha: "def456",
        commit: {
          message: "fix: Fix bug",
          author: {
            name: "Test User",
            email: "test@example.com",
            date: "2024-01-02T00:00:00Z",
          },
        },
        author: { login: "testuser" },
        html_url: "https://github.com/test/commit/def456",
      },
    ],
    previousTag: "v1.0.0",
    currentTag: "v1.0.1",
    prs: [
      {
        number: 123,
        title: "Add new feature",
        body: "This adds a new feature",
        labels: [{ name: "feature" }],
        html_url: "https://github.com/test/pull/123",
      },
    ],
  };

  describe("generate", () => {
    it("LLM을 사용하여 CHANGELOG를 생성해야 함", async () => {
      const mockResponse = `## 🎉 새로운 기능
- 새로운 기능 추가

## 🐛 버그 수정
- 버그 수정

## 📝 기타 변경사항
- 기타 개선사항`;

      mockLLM.invoke.mockResolvedValue(mockResponse);

      const result = await changelogGenerator.generate(mockChangelogData);

      expect(result).toBe(mockResponse);
      expect(mockLLM.invoke).toHaveBeenCalled();
    });

    it("LLM 호출 실패 시 에러를 던져야 함", async () => {
      mockLLM.invoke.mockRejectedValue(new Error("LLM error"));

      await expect(
        changelogGenerator.generate(mockChangelogData)
      ).rejects.toThrow();
    });
  });

  describe("generateFallback", () => {
    it("기본 CHANGELOG를 생성해야 함", () => {
      const result = changelogGenerator.generateFallback(mockChangelogData);

      expect(result).toContain("📋 변경사항");
      expect(result).toContain("2개의 커밋");
      expect(result).toContain("Pull Requests");
      expect(result).toContain("#123");
      expect(result).toContain("abc123");
      expect(result).toContain("feat: Add new feature");
    });

    it("커밋이 20개 이상일 때 일부만 표시하고 나머지는 요약해야 함", () => {
      const manyCommits = Array.from({ length: 25 }, (_, i) => ({
        sha: `commit${i}`,
        commit: {
          message: `Commit ${i}`,
          author: {
            name: "Test User",
            email: "test@example.com",
            date: "2024-01-01T00:00:00Z",
          },
        },
        author: { login: "testuser" },
        html_url: `https://github.com/test/commit/commit${i}`,
      }));

      const data: ChangelogData = {
        ...mockChangelogData,
        commits: manyCommits,
      };

      const result = changelogGenerator.generateFallback(data);

      expect(result).toContain("25개의 커밋");
      expect(result).toContain("5개의 추가 커밋");
    });

    it("PR이 없을 때도 정상적으로 작동해야 함", () => {
      const dataWithoutPRs: ChangelogData = {
        ...mockChangelogData,
        prs: [],
      };

      const result = changelogGenerator.generateFallback(dataWithoutPRs);

      expect(result).toContain("📋 변경사항");
      expect(result).not.toContain("Pull Requests");
    });
  });

  describe("generateWithFallback", () => {
    it("LLM이 성공하면 생성된 CHANGELOG를 반환해야 함", async () => {
      const mockResponse = "## 🎉 새로운 기능\n- 새로운 기능";
      mockLLM.invoke.mockResolvedValue(mockResponse);

      const result = await changelogGenerator.generateWithFallback(
        mockChangelogData
      );

      expect(result).toBe(mockResponse);
    });

    it("LLM이 실패하면 폴백 CHANGELOG를 반환해야 함", async () => {
      mockLLM.invoke.mockRejectedValue(new Error("LLM error"));

      const result = await changelogGenerator.generateWithFallback(
        mockChangelogData
      );

      expect(result).toContain("📋 변경사항");
      expect(result).toContain("자동 생성된 CHANGELOG");
    });
  });

  describe("formatChangelogData (private method)", () => {
    it("변경사항 데이터를 올바르게 포맷팅해야 함", async () => {
      // private 메서드를 테스트하기 위해 generate를 통해 간접적으로 테스트
      let capturedPrompt = "";
      mockLLM.invoke.mockImplementation((prompt: string) => {
        capturedPrompt = prompt;
        return Promise.resolve("Test response");
      });

      await changelogGenerator.generate(mockChangelogData);

      expect(capturedPrompt).toContain("v1.0.1");
      expect(capturedPrompt).toContain("v1.0.0");
      expect(capturedPrompt).toContain("2");
      expect(capturedPrompt).toContain("1");
      expect(capturedPrompt).toContain("#123");
      expect(capturedPrompt).toContain("Add new feature");
    });
  });
});
