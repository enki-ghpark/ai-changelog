# RAG 기능 가이드

## 개요

RAG (Retrieval-Augmented Generation) 기능은 **전체 코드베이스**를 분석하여 코드 변경사항을 더 깊이 이해하고, **변경으로 인해 영향받을 수 있는 다른 파일들을 자동으로 찾아** 맥락있는 CHANGELOG를 생성하기 위한 고급 기능입니다.

### 핵심 가치: 영향 분석

단순히 변경된 파일만 보는 게 아니라, **변경으로 인해 영향받을 수 있는 다른 파일들**을 자동으로 찾아냅니다.

**예시:**

```
변경: packages/core/src/repository/base-repository.ts
- findMany 함수 수정
- limit 적용 로직 변경

↓ (RAG 영향 분석)

영향받는 파일 자동 발견:
→ examples/nestjs-test/src/user/user.service.ts (findMany 사용)
→ examples/nestjs-test/src/project/project.service.ts (findMany 사용)
→ packages/core/src/__tests__/unit/Repository.test.ts (findMany 테스트)

CHANGELOG에 자동 추가:
"🔄 영향 범위: UserService, ProjectService 등에서 사용하는
findMany API의 limit 동작이 변경되어 해당 코드도 검토가 필요할 수 있습니다."
```

## 작동 방식

### 1. 전체 코드베이스 색인

전체 저장소의 코드 파일을 수집하여 벡터 스토어에 색인합니다:

- GitHub Git Tree API로 모든 파일 목록 가져오기
- 코드 파일 필터링 (.ts, .tsx, .js, .py, .java, .go, .rs 등)
- 제외 경로 필터링 (node_modules, dist, .git 등)
- 최대 100개 파일 내용 가져오기 (각 1MB 이하)
- 배치 처리로 성능 최적화

### 2. 파일 변경 분석

릴리즈의 모든 커밋에서 변경된 파일을 수집하고 분석합니다:

- 코드 파일 필터링 (.ts, .tsx, .js, .py 등)
- 파일 변경 통계 수집 (추가/삭제/수정 라인 수)
- Diff 내용 추출
- 변경된 파일의 전체 내용 가져오기 (상위 20개 파일, 1MB 이하)

### 3. 벡터 색인

전체 코드베이스를 의미적으로 검색 가능한 형태로 변환합니다:

1. **청크 분할**: 큰 파일을 1000토큰 크기의 청크로 분할
2. **임베딩 생성**: Ollama의 임베딩 모델로 각 청크를 벡터화
3. **벡터 스토어**: 메모리 기반 벡터 스토어에 저장

### 4. 영향 분석 (Impact Analysis)

변경된 코드가 다른 파일에 미치는 영향을 자동으로 분석합니다:

**단계 1: 식별자 추출**

- 변경된 파일의 diff/content에서 함수명, 클래스명, 타입명 추출
- 정규식 기반 다중 언어 지원 (TypeScript, Python, Go, Rust 등)
- 예: `findMany`, `BaseRepository`, `UserService` 등

**단계 2: 영향받는 파일 검색**

- 추출된 식별자를 쿼리로 전체 코드베이스 검색
- 벡터 유사도 기반 Top-K 검색
- 변경된 파일 자체는 제외

**단계 3: 영향 보고서 생성**

- 각 식별자가 어떤 파일에서 사용되는지 매핑
- 잠재적 영향 파일 목록 생성
- CHANGELOG에 "🔄 영향 범위" 섹션으로 추가

### 5. 향상된 CHANGELOG 생성

수집된 모든 정보를 LLM에 전달합니다:

- 커밋 메시지
- PR 정보
- 파일 변경사항 (상태, 통계, diff)
- **RAG 영향 분석 결과** (영향받는 파일 목록)

LLM은 이 정보를 종합하여 다음을 포함한 CHANGELOG를 생성합니다:

- 🎉 새로운 기능
- 🐛 버그 수정
- ⚠️ Breaking Changes
- **🔄 영향 범위** (RAG 분석 기반)
- 📝 기타 변경사항

> 💡 **왜 전체 코드베이스를 색인하나요?**
>
> 변경된 파일에서 사용하는 함수/클래스가 **다른 어떤 파일들에서 사용되는지** 찾기 위해서입니다.
>
> **예시:** `BaseRepository.findMany`를 변경했을 때
>
> - 전체 코드베이스에서 `findMany`를 사용하는 파일 검색
> - UserService, ProjectService 등이 영향받는 것을 자동으로 발견
> - CHANGELOG에 "🔄 영향 범위" 섹션으로 추가

## 설정

### 환경 변수

```bash
# RAG 활성화/비활성화
ENABLE_RAG=true

# 임베딩 모델 (Ollama에서 사용 가능한 모델)
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

# 기본 Ollama 설정
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:latest
```

### 지원 임베딩 모델

Ollama에서 사용 가능한 임베딩 모델:

- `nomic-embed-text` (권장, 768차원)
- `all-minilm` (384차원, 빠름)
- `bge-large` (1024차원, 높은 정확도)

모델 다운로드:

```bash
ollama pull nomic-embed-text
```

## 성능 최적화

### 파일 크기 및 수 제한

**전체 코드베이스 색인:**

- **최대 파일 크기**: 1MB
- **최대 파일 수**: 100개
- **배치 크기**: 10개 파일씩 병렬 처리

**변경된 파일 분석:**

- **최대 파일 크기**: 1MB
- **최대 파일 수**: 상위 20개 (변경 라인 수 기준)
- **최대 diff 크기**: 제한 없음 (필요 시 청크 분할)

### 병렬 처리

- 전체 코드베이스 파일을 10개씩 배치로 병렬 처리
- 커밋별 파일 변경사항을 병렬로 수집
- 파일 내용 가져오기를 병렬로 처리
- API 호출 최적화

### 배치 임베딩

- 임베딩 생성 시 20개씩 배치로 나눠서 처리
- 각 배치가 완료될 때마다 진행 상황 표시
- 배치 사이에 1초 대기 시간을 두어 서버 부담 감소
- 타임아웃 방지를 위한 순차적 배치 처리
- 대용량 코드베이스도 안정적으로 색인

### 해시 기반 캐싱 (임베딩 벡터 캐싱)

- 파일 내용의 SHA-256 해시를 계산하여 캐시 키로 사용
- `.cache/embeddings/` 디렉토리에 **문서 청크와 임베딩 벡터**를 JSON 형식으로 저장
- 변경되지 않은 파일은 임베딩 생성을 완전히 스킵 (Ollama 서버 호출 없음)
- 캐시 히트/미스 통계를 실시간으로 표시 (예: `💾 캐시 통계: 95개 히트, 5개 미스 (95% 절약)`)
- 모델명이 변경되면 자동으로 캐시 무효화
- **두 번째 실행부터 속도가 극적으로 향상** (캐시 100% 히트 시 임베딩 생성 시간 = 0초)

### GitHub Actions 캐싱

GitHub Actions에서 실행 시 자동으로 캐시를 관리합니다:

- `actions/cache@v4`를 사용하여 `.cache/embeddings/` 디렉토리 캐싱
- 캐시 키: `embeddings-cache-{임베딩모델명}-{실행ID}`
- 복원 키: 같은 모델의 이전 캐시를 우선 복원
- 캐시는 최대 10GB, 7일간 GitHub에 저장
- 각 릴리즈마다 이전 릴리즈의 캐시를 재사용하여 빠르게 실행

**작동 방식:**

```yaml
- name: RAG 임베딩 캐시 복원
  uses: actions/cache@v4
  with:
    path: .cache/embeddings
    key: embeddings-cache-${{ vars.OLLAMA_EMBEDDING_MODEL }}-${{ github.run_id }}
    restore-keys: |
      embeddings-cache-${{ vars.OLLAMA_EMBEDDING_MODEL }}-
      embeddings-cache-
```

### 메모리 관리

- 메모리 기반 벡터 스토어 사용
- 작업 완료 후 자동으로 리소스 정리
- 캐시는 디스크에 저장되어 재사용 가능
- 청크 크기 최적화로 메모리 사용량 제어

## 비활성화

RAG 기능이 필요 없거나 성능 문제가 있는 경우:

```bash
# 환경 변수로 비활성화
ENABLE_RAG=false

# 또는 .env 파일에서
echo "ENABLE_RAG=false" >> .env
```

RAG를 비활성화하면:

- 기본 커밋 메시지 기반 CHANGELOG 생성
- 파일 변경 분석 수행되지 않음
- 더 빠른 실행 속도
- 적은 메모리 사용

## 트러블슈팅

### Ollama 임베딩 모델 오류

**증상:**

```
Error: Failed to load embedding model
```

**해결:**

1. 모델이 다운로드되어 있는지 확인:

   ```bash
   ollama list
   ```

2. 모델 다운로드:

   ```bash
   ollama pull nomic-embed-text
   ```

3. Ollama 서버 확인:
   ```bash
   curl http://localhost:11434/api/version
   ```

### 메모리 부족

**증상:**

```
JavaScript heap out of memory
```

**해결:**

1. Node.js 메모리 제한 증가:

   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" pnpm run start
   ```

2. 처리할 파일 수 줄이기 (코드 수정 필요)

3. RAG 비활성화:
   ```bash
   ENABLE_RAG=false pnpm run start
   ```

### 느린 실행 속도

**원인 (첫 번째 실행):**

- 임베딩 생성 시간 (전체 코드베이스 색인)
- 네트워크 지연 (원격 Ollama)
- 대용량 파일 처리

**자동 개선 (두 번째 실행부터):**

- ✨ **임베딩 캐싱이 자동으로 작동**합니다
- 변경되지 않은 파일은 임베딩을 재사용 (Ollama 호출 없음)
- 캐시 100% 히트 시: **임베딩 생성 시간 = 0초**
- 일반적으로 두 번째 실행부터 **10-60배 빠름**

**추가 개선 방법:**

1. 빠른 임베딩 모델 사용:

   ```bash
   OLLAMA_EMBEDDING_MODEL=all-minilm
   ```

2. 로컬 Ollama 사용

3. 파일 크기 제한 조정 (코드 수정)

4. 캐시 확인:
   ```bash
   ls -lh .cache/embeddings/
   # 캐시가 있으면 두 번째 실행이 매우 빠름
   ```

## 고급 설정

### 청크 크기 조정

`src/index.ts`에서 RAG 설정 변경:

```typescript
const ragConfig: RAGConfig = {
  ollamaBaseUrl,
  embeddingModel: ollamaEmbeddingModel,
  chunkSize: 1000, // 청크 크기 (토큰)
  chunkOverlap: 200, // 청크 오버랩
  topK: 5, // 검색할 문서 수
};
```

### 코드 파일 확장자 추가

`src/utils/github.ts`의 `CODE_EXTENSIONS` 배열 수정:

```typescript
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
  ".cpp",
  ".c",
  ".cs",
  ".php", // 추가
];
```

### 파일 개수 제한 변경

`src/utils/github.ts`의 `analyzeChangedFiles` 메서드:

```typescript
// 상위 20개 파일만 내용 가져오기
const topFiles = fileChanges.sort((a, b) => b.changes - a.changes).slice(0, 20); // 이 값을 변경
```

## 예제 출력

### RAG 활성화 시

```
🚀 GitHub 자동 CHANGELOG 생성 시작

📦 저장소: myorg/myrepo
🏷️  릴리즈 태그: v1.2.0
🤖 Ollama 서버: http://localhost:11434
🧠 모델: llama3.1:latest
🔍 RAG 활성화: 예

📋 릴리즈 정보 조회 중...
✅ 릴리즈 발견: Version 1.2.0

📊 릴리즈 v1.2.0에 대한 향상된 변경사항 수집 중...
📌 이전 릴리즈: v1.1.0
✅ 15개의 커밋을 찾았습니다
✅ 3개의 Pull Request를 찾았습니다

🔍 파일 변경사항 분석 중...
📄 23개의 코드 파일이 변경되었습니다
✅ 18개 파일의 내용을 가져왔습니다

🔍 파일 변경사항을 RAG 시스템에 색인 중...
📚 45개의 문서 청크 생성됨
✅ RAG 시스템 색인 완료

🔎 코드 컨텍스트 생성 중...
✅ 8개의 관련 코드 컨텍스트 생성됨

🤖 AI를 사용하여 향상된 CHANGELOG 생성 중...
✅ CHANGELOG 생성 완료
```

### RAG 비활성화 시

```
🚀 GitHub 자동 CHANGELOG 생성 시작

📦 저장소: myorg/myrepo
🏷️  릴리즈 태그: v1.2.0
🤖 Ollama 서버: http://localhost:11434
🧠 모델: llama3.1:latest
🔍 RAG 활성화: 아니오

📋 릴리즈 정보 조회 중...
✅ 릴리즈 발견: Version 1.2.0

📊 릴리즈 v1.2.0에 대한 변경사항 수집 중...
📌 이전 릴리즈: v1.1.0
✅ 15개의 커밋을 찾았습니다
✅ 3개의 Pull Request를 찾았습니다

🤖 AI를 사용하여 CHANGELOG 생성 중...
✅ CHANGELOG 생성 완료
```

## 참고 자료

- [LangChain 문서](https://js.langchain.com/)
- [Ollama 임베딩 모델](https://ollama.com/library)
- [Vector Store 개념](https://js.langchain.com/docs/modules/data_connection/vectorstores/)
