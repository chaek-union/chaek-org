# 책 (Chaek) 프로젝트 - Claude AI 가이드

## 프로젝트 개요

이 프로젝트는 대학 교재를 호스팅하는 SvelteKit 기반 웹 플랫폼입니다. GitHub의 HonKit 기반 저장소를 자동으로 빌드하고 서빙하며, GitHub OAuth 인증과 빌드 로그 관리 기능을 제공합니다.

## 핵심 아키텍처

### 디렉토리 구조
- `src/routes/` - SvelteKit 라우트
  - `+page.svelte` - 메인 페이지 (교재 목록)
  - `+layout.server.ts` - 세션 정보 로드
  - `books/[bookId]/` - 개별 교재 뷰어
  - `builds/` - 빌드 로그 페이지 (chaek-union 멤버 전용)
  - `api/webhook/` - GitHub webhook 엔드포인트
  - `api/builds/` - 빌드 로그 API 엔드포인트
- `src/lib/server/` - 서버 전용 모듈
  - `db/` - PostgreSQL 데이터베이스 모듈
    - `index.ts` - DB 연결 및 쿼리 헬퍼
    - `users.ts` - 사용자 관리
    - `builds.ts` - 빌드 로그 관리
    - `schema.sql` - DB 스키마 정의
  - `books.ts` - 교재 목록 및 메타데이터 관리
  - `compiler.ts` - Git 클론 및 HonKit 빌드 로직 (빌드 로그 DB 저장)
- `src/lib/components/` - Svelte 컴포넌트
  - `Navbar.svelte` - 네비게이션 바 (로그인/로그아웃, 빌드 로그 링크)
  - `LanguageSwitcher.svelte` - 드롭다운 언어 선택기
  - `BookCard.svelte` - 교재 카드 컴포넌트
- `src/hooks.server.ts` - Auth.js 인증 및 정적 파일 서빙
- `books/` - 클론된 Git 저장소 (gitignored)
- `static/books/` - 컴파일된 정적 HTML (gitignored)

### 주요 플로우

1. **GitHub OAuth 인증**
   - `hooks.server.ts`에서 Auth.js 설정
   - GitHub OAuth로 로그인
   - `chaek-union` 조직 멤버십 확인 (Octokit API 사용)
   - 사용자 정보를 PostgreSQL에 저장/업데이트

2. **GitHub Webhook → 자동 빌드**
   - `chaek-union` 조직의 저장소에서 push 발생
   - `/api/webhook` 엔드포인트가 이벤트 수신
   - `compiler.ts`가 빌드 로그 생성 (DB)
   - 저장소 클론/업데이트
   - `npx honkit build` 실행하여 `static/books/{repo-name}/`에 출력
   - 빌드 결과(stdout, stderr, 상태)를 DB에 저장

3. **교재 목록 표시**
   - `books.ts`가 `books/` 디렉토리 스캔
   - 컴파일된 교재만 목록에 표시
   - 한국어/영어 다국어 지원

4. **교재 읽기**
   - `/books/{bookId}` 라우트로 접근
   - iframe으로 `/books/{bookId}/index.html` 로드

5. **빌드 로그 조회** (chaek-union 멤버 전용)
   - `/builds` 페이지에서 모든 교재의 최신 빌드 로그 조회
   - 빌드 클릭 시 상세 로그(stdout, stderr) 모달로 표시
   - `/api/builds` API로 빌드 로그 조회

## 기술 스택

- **프론트엔드**: SvelteKit 2, TypeScript, Svelte 5
- **백엔드**: Node.js (SvelteKit API routes)
- **데이터베이스**: PostgreSQL 16 (Docker Compose로 제공)
- **인증**: Auth.js (GitHub OAuth)
- **빌드**: HonKit (GitBook fork)
- **Git**: simple-git 라이브러리
- **i18n**: 커스텀 i18n 구현 (브라우저 언어 자동 감지)

## 환경 변수

필수 환경 변수 (`.env` 파일):
- `DATABASE_URL` - PostgreSQL 연결 문자열
- `GITHUB_ID` - GitHub OAuth App Client ID
- `GITHUB_SECRET` - GitHub OAuth App Client Secret
- `AUTH_SECRET` - Auth.js 비밀 키 (openssl rand -base64 32로 생성)

## 데이터베이스 스키마

### users 테이블
- GitHub 사용자 정보 저장
- `github_id`, `username`, `avatar_url`, `is_chaek_member`
- `chaek-union` 조직 멤버십 여부 저장

### build_logs 테이블
- 빌드 로그 저장
- `book_id`, `book_name`, `repo_url`, `status` (running/success/failed)
- `stdout`, `stderr`, `error_message`
- `started_at`, `completed_at`, `triggered_by`

데이터베이스 스키마는 서버 시작 시 자동으로 초기화됩니다 (`src/lib/server/db/schema.sql`).

## 개발 시 주의사항

### 코드 수정 시
- 서버 전용 코드는 `src/lib/server/`에 위치해야 함
- 프론트엔드에서는 절대 `fs`, `child_process` 등 Node.js API를 직접 사용하지 말 것
- 모든 서버 로직은 `+page.server.ts`, `+server.ts` 또는 `src/lib/server/`에서만

### 인증 및 권한
- GitHub OAuth를 통한 사용자 인증
- `chaek-union` 조직 멤버만 빌드 로그 접근 가능
- 비멤버는 교재 읽기만 가능
- 세션 정보에 `isChaekMember` 플래그 저장

### Webhook 보안
- `chaek-union` 조직 외의 저장소는 자동으로 거부됨
- Secret 검증은 사용하지 않음 (조직 검증만 수행)
- 모든 push 이벤트는 로그에 기록됨

### 빌드 프로세스
- HonKit 빌드는 비동기로 실행 (webhook 응답을 블로킹하지 않음)
- 빌드 시작 시 DB에 로그 생성 (status: 'running')
- 빌드 완료 시 stdout/stderr와 함께 상태 업데이트
- 빌드는 `npx honkit build` 명령어 사용 (각 저장소의 로컬 의존성 사용)
- chaek-union 멤버는 `/builds` 페이지에서 모든 빌드 로그 조회 가능

### 교재 저장소 요구사항
- HonKit 프로젝트 구조 (`book.json` 또는 `SUMMARY.md`)
- `npx honkit build` 명령어로 빌드 가능해야 함
- `chaek-union` GitHub 조직에 속해야 함

## 일반적인 작업

### 새로운 기능 추가
1. 프론트엔드 UI 변경: `src/routes/+page.svelte` 또는 관련 Svelte 파일 수정
2. API 엔드포인트 추가: `src/routes/api/` 하위에 `+server.ts` 생성
3. 서버 로직 추가: `src/lib/server/` 하위에 `.ts` 파일 생성

### 디버깅
- 개발 서버: `npm run dev`
- 빌드 로그: 콘솔 출력 확인 (`console.log`, `console.error`)
- Webhook 테스트: `/api/webhook`에 GET 요청으로 상태 확인 가능

### 배포
- 빌드: `npm run build`
- 실행: `node build` 또는 `node build/index.js`
- 포트: 기본값은 3000 (환경변수 `PORT`로 변경 가능)

## UI/UX 개선사항

### 랜딩 페이지
- 전체 화면 너비 레이아웃
- 상단 고정 네비게이션 바
- 그라디언트 히어로 섹션
- 반응형 교재 카드 그리드
- 교재 카드 호버 애니메이션

### 네비게이션
- 드롭다운 언어 선택기 (🌐 아이콘)
- GitHub 로그인 버튼 (비로그인 시)
- 사용자 메뉴 (로그인 시): 아바타, 이름, 로그아웃
- 빌드 로그 링크 (chaek-union 멤버만)

### 빌드 로그 페이지
- 테이블 형식으로 빌드 목록 표시
- 상태별 색상 구분 (running/success/failed)
- 빌드 클릭 시 모달로 상세 로그 표시
- stdout/stderr 구분하여 표시

## 알려진 제약사항

1. 교재는 반드시 `chaek-union` 조직에 속해야 함
2. 교재 메타데이터는 파일시스템 기반 (book.json 파싱)
3. 동시 빌드 시 충돌 가능성 (락 메커니즘 없음)

## 기여 가이드라인

- UI 텍스트는 한국어/영어 번역 파일(`src/lib/i18n/locales/`)에 추가
- 코드 주석은 영어 또는 한국어 모두 가능
- TypeScript strict 모드 준수
- 서버/클라이언트 코드 경계 명확히 구분

## 다국어 지원

- 브라우저 언어 설정에 따라 자동으로 한국어/영어 선택
- localStorage에 사용자 언어 선택 저장
- 번역 파일: `src/lib/i18n/locales/{ko,en}.json`
- i18n 로직: `src/lib/i18n/index.ts`
