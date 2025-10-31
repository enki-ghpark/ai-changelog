# 실제 저장소로 테스트하기

이 가이드는 실제 GitHub 저장소의 릴리즈 데이터로 act를 테스트하는 방법을 설명합니다.

## 테스트 이벤트 파일 수정

`.github/workflows/test-event.json` 파일을 실제 저장소와 릴리즈 정보에 맞게 수정해야 합니다.

### 1. 저장소 정보 변경

```json
{
  "repository": {
    "name": "your-repo-name",
    "full_name": "your-org/your-repo-name",
    "owner": {
      "login": "your-org"
    }
  }
}
```

### 2. 릴리즈 정보 변경

실제 릴리즈의 태그 이름과 정보를 입력하세요:

```json
{
  "release": {
    "tag_name": "v0.2.0", // 테스트할 실제 릴리즈 태그
    "name": "Release 0.2.0",
    "body": "기존 릴리즈 노트 내용",
    "draft": false,
    "prerelease": false,
    "created_at": "2024-01-15T10:00:00Z",
    "published_at": "2024-01-15T10:00:00Z",
    "id": 123456789 // 실제 릴리즈 ID
  }
}
```

## 실제 릴리즈 정보 가져오기

### GitHub CLI 사용 (권장)

```bash
# 최신 릴리즈 정보 가져오기
gh release view --repo your-org/your-repo --json tagName,name,body,id,createdAt,publishedAt
```

### GitHub API 사용

```bash
# 최신 릴리즈 조회
curl -H "Authorization: token YOUR_TOKEN" \
  https://api.github.com/repos/your-org/your-repo/releases/latest

# 모든 릴리즈 목록
curl -H "Authorization: token YOUR_TOKEN" \
  https://api.github.com/repos/your-org/your-repo/releases
```

### 웹 브라우저 사용

1. GitHub 저장소의 Releases 페이지 방문
2. 테스트할 릴리즈 선택
3. URL에서 릴리즈 정보 확인

## 테스트 시나리오 예제

### 시나리오 1: 첫 번째 릴리즈 테스트

이전 릴리즈가 없는 경우 (모든 커밋이 CHANGELOG에 포함됨):

```json
{
  "release": {
    "tag_name": "v1.0.0",
    "name": "Initial Release",
    "body": "",
    "id": 1
  }
}
```

### 시나리오 2: 후속 릴리즈 테스트

이전 릴리즈(`v1.0.0`)와 현재 릴리즈(`v1.1.0`) 사이의 변경사항 테스트:

```json
{
  "release": {
    "tag_name": "v1.1.0",
    "name": "Feature Update",
    "body": "기존 릴리즈 노트",
    "id": 2
  }
}
```

### 시나리오 3: 다양한 커밋 타입 테스트

feat, fix, breaking 등 다양한 커밋 타입이 포함된 릴리즈:

```json
{
  "release": {
    "tag_name": "v2.0.0",
    "name": "Major Release with Breaking Changes",
    "body": "",
    "id": 3
  }
}
```

## 환경 변수 설정

`.secrets` 파일에 실제 저장소 정보 설정:

```bash
GITHUB_TOKEN=ghp_your_actual_token
OLLAMA_BASE_URL=http://localhost:11434
```

`.env` 파일에 저장소 정보 설정 (로컬 테스트용):

```bash
GITHUB_REPOSITORY=0ffen/neogm
RELEASE_TAG=v0.1.0
```

## act 실행

테스트 이벤트 파일 수정 후:

```bash
# 전체 워크플로우 실행
pnpm run test:act

# 특정 job만 실행
act release -j generate-changelog --secret-file .secrets --var-file .vars -e .github/workflows/test-event.json

# Verbose 모드
pnpm run test:act -- --verbose
```

## 주의사항

1. **실제 릴리즈 수정**: act 테스트는 실제 GitHub 릴리즈를 수정합니다. 테스트용 저장소나 태그를 사용하세요.

2. **권한 확인**: GitHub Token이 저장소에 대한 쓰기 권한이 있는지 확인하세요.

3. **Ollama 연결**: Ollama 서버가 실행 중이고 접근 가능한지 확인하세요.

4. **이전 릴리즈**: 이전 릴리즈가 있어야 비교가 가능합니다. 첫 릴리즈는 모든 커밋을 포함합니다.

## 디버깅

### 릴리즈 정보 확인

```bash
# 로컬에서 직접 실행
GITHUB_TOKEN=your_token \
GITHUB_REPOSITORY=your-org/your-repo \
RELEASE_TAG=v1.0.0 \
OLLAMA_BASE_URL=http://localhost:11434 \
OLLAMA_MODEL=gpt-oss:120b \
pnpm run start
```

### 커밋 목록 확인

```bash
# 두 태그 사이의 커밋 비교
git log v1.0.0..v1.1.0 --oneline

# GitHub API로 확인
curl -H "Authorization: token YOUR_TOKEN" \
  "https://api.github.com/repos/your-org/your-repo/compare/v1.0.0...v1.1.0"
```

## 예제: 완전한 test-event.json

```json
{
  "release": {
    "tag_name": "v0.2.1",
    "name": "Bug Fix Release",
    "body": "# 기존 릴리즈 노트\n\n수동으로 작성한 내용",
    "draft": false,
    "prerelease": false,
    "created_at": "2024-10-31T12:00:00Z",
    "published_at": "2024-10-31T12:00:00Z",
    "id": 987654321,
    "target_commitish": "main",
    "html_url": "https://github.com/0ffen/neogm/releases/tag/v0.2.1"
  },
  "repository": {
    "name": "neogm",
    "full_name": "0ffen/neogm",
    "owner": {
      "login": "0ffen",
      "id": 12345678,
      "type": "Organization"
    },
    "private": true,
    "html_url": "https://github.com/0ffen/neogm"
  },
  "sender": {
    "login": "your-username",
    "type": "User"
  }
}
```

이제 실제 저장소의 릴리즈로 테스트할 준비가 되었습니다! 🚀
