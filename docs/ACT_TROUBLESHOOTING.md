# act 문제 해결 가이드

## Docker 인증 문제

### 증상

```
pulling image failed with credentials Error response from daemon: unauthorized: incorrect username or password
```

### 해결 방법

1. **Docker 로그아웃**

   ```bash
   docker logout
   ```

2. **Docker 이미지 직접 pull**

   ```bash
   docker pull catthehacker/ubuntu:act-latest --platform linux/amd64
   ```

3. **act 다시 실행**
   ```bash
   pnpm run test:act
   ```

## GitHub Token 인증 문제

### 증상

```
Unable to clone https://github.com/actions/setup-node: authentication required
```

### 해결 방법

#### 방법 1: 유효한 GitHub Token 설정 (권장)

1. **GitHub Personal Access Token 생성**

   - GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - "Generate new token (classic)" 클릭
   - 필요한 권한 선택:
     - ✅ `repo` (전체)
     - ✅ `workflow`
   - Token 생성 및 복사

2. **`.secrets` 파일 업데이트**

   ```bash
   nano .secrets
   ```

   내용:

   ```
   GITHUB_TOKEN=ghp_your_actual_token_here
   OLLAMA_BASE_URL=http://localhost:11434
   ```

3. **다시 실행**
   ```bash
   pnpm run test:act
   ```

#### 방법 2: Actions 캐싱 사용

act는 한 번 다운로드한 actions를 캐시합니다. 유효한 token으로 한 번 실행하면, 이후에는 캐시된 actions를 사용합니다.

```bash
# 캐시 위치 확인
ls ~/.cache/act/
```

#### 방법 3: 로컬 Actions 사용 (고급)

GitHub Actions를 로컬에 clone하여 사용할 수 있습니다:

```yaml
# .github/workflows/changelog.yml 수정 (테스트용)
- name: Node.js 설정
  uses: ./actions/setup-node # 로컬 경로
```

#### 방법 4: Token 없이 테스트 (제한적)

일부 기능을 건너뛰고 테스트:

```bash
# Workflow의 특정 step만 실행하도록 수정
act release --secret-file .secrets --var-file .vars -j generate-changelog --bind
```

## Ollama 연결 문제

### 증상

```
Error: connect ECONNREFUSED localhost:11434
```

### 해결 방법

1. **Ollama 서버 확인**

   ```bash
   curl http://localhost:11434/api/version
   ```

2. **네트워크 설정 확인**

   Docker 컨테이너가 호스트 네트워크에 접근할 수 있는지 확인:

   ```bash
   # macOS/Linux
   docker run --rm --network host curlimages/curl:latest curl http://localhost:11434/api/version
   ```

3. **방화벽 설정 확인**

   방화벽이 localhost:11434 접근을 차단하지 않는지 확인

4. **로컬 Ollama 사용 (대안)**

   로컬에 Ollama를 설치하고 테스트:

   ```bash
   # macOS
   brew install ollama
   ollama serve
   ```

   `.secrets` 파일 수정:

   ```
   OLLAMA_BASE_URL=http://host.docker.internal:11434
   ```

## act 실행 팁

### Dry-run으로 먼저 확인

```bash
pnpm run test:act -- --dryrun
```

### Verbose 모드로 상세 로그 확인

```bash
act release -e .github/workflows/test-event.json \
  --secret-file .secrets \
  --var-file .vars \
  --verbose
```

### 특정 Job만 실행

```bash
act release -j generate-changelog --secret-file .secrets --var-file .vars
```

### Action 캐시 삭제 (문제 해결 시)

```bash
rm -rf ~/.cache/act/
```

### Docker 로그 확인

```bash
docker logs $(docker ps -a | grep act | awk '{print $1}' | head -1)
```

## 빠른 체크리스트

테스트 전 확인사항:

- [ ] Docker가 실행 중인가?

  ```bash
  docker ps
  ```

- [ ] Git 저장소가 초기화되었나?

  ```bash
  git status
  ```

- [ ] `.secrets` 파일에 유효한 GITHUB_TOKEN이 있나?

  ```bash
  cat .secrets | grep GITHUB_TOKEN
  ```

- [ ] `.vars` 파일이 있나?

  ```bash
  cat .vars
  ```

- [ ] Ollama 서버에 접근 가능한가?

  ```bash
  curl http://localhost:11434/api/version
  ```

- [ ] act가 설치되어 있나?
  ```bash
  act --version
  ```

## 추가 리소스

- [act 공식 문서](https://nektosact.com/)
- [act GitHub Issues](https://github.com/nektos/act/issues)
- [GitHub Actions 문서](https://docs.github.com/en/actions)
