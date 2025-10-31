#!/bin/bash

# GitHub 저장소의 최신 릴리즈 정보를 가져와서 test-event.json을 자동으로 업데이트하는 스크립트

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 환경 변수 확인
if [ -z "$GITHUB_TOKEN" ]; then
  echo -e "${RED}❌ GITHUB_TOKEN 환경 변수가 설정되지 않았습니다${NC}"
  echo "사용법: GITHUB_TOKEN=your_token $0 <owner/repo> [tag]"
  exit 1
fi

if [ -z "$1" ]; then
  echo -e "${RED}❌ 저장소를 지정해주세요${NC}"
  echo "사용법: GITHUB_TOKEN=your_token $0 <owner/repo> [tag]"
  exit 1
fi

REPO=$1
TAG=$2

echo -e "${GREEN}📦 저장소: $REPO${NC}"

# 최신 릴리즈 정보 가져오기
if [ -z "$TAG" ]; then
  echo -e "${YELLOW}🔍 최신 릴리즈 조회 중...${NC}"
  RELEASE_DATA=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/repos/$REPO/releases/latest")
else
  echo -e "${YELLOW}🔍 릴리즈 $TAG 조회 중...${NC}"
  RELEASE_DATA=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/repos/$REPO/releases/tags/$TAG")
fi

# 에러 체크
if echo "$RELEASE_DATA" | grep -q '"message"'; then
  echo -e "${RED}❌ 릴리즈를 찾을 수 없습니다${NC}"
  echo "$RELEASE_DATA" | jq -r '.message'
  exit 1
fi

# 데이터 추출
TAG_NAME=$(echo "$RELEASE_DATA" | jq -r '.tag_name')
NAME=$(echo "$RELEASE_DATA" | jq -r '.name // .tag_name')
BODY=$(echo "$RELEASE_DATA" | jq -r '.body // ""')
ID=$(echo "$RELEASE_DATA" | jq -r '.id')
CREATED_AT=$(echo "$RELEASE_DATA" | jq -r '.created_at')
PUBLISHED_AT=$(echo "$RELEASE_DATA" | jq -r '.published_at')

echo -e "${GREEN}✅ 릴리즈 정보:${NC}"
echo "  태그: $TAG_NAME"
echo "  이름: $NAME"
echo "  ID: $ID"
echo "  발행일: $PUBLISHED_AT"

# owner/repo 분리
IFS='/' read -r OWNER REPO_NAME <<< "$REPO"

# test-event.json 생성
TEST_EVENT_PATH="test-event.json"

cat > "$TEST_EVENT_PATH" << EOF
{
  "release": {
    "tag_name": "$TAG_NAME",
    "name": "$NAME",
    "body": $(echo "$BODY" | jq -Rs .),
    "draft": false,
    "prerelease": false,
    "created_at": "$CREATED_AT",
    "published_at": "$PUBLISHED_AT",
    "id": $ID
  },
  "repository": {
    "name": "$REPO_NAME",
    "full_name": "$REPO",
    "owner": {
      "login": "$OWNER"
    }
  }
}
EOF

echo -e "${GREEN}✅ $TEST_EVENT_PATH 파일이 업데이트되었습니다${NC}"
echo ""
echo -e "${YELLOW}💡 이제 다음 명령으로 테스트할 수 있습니다:${NC}"
echo "  pnpm run test:act"

