# 책 (Chaek) 프로젝트 - Claude AI 가이드

## 프로젝트 개요

이 프로젝트는 대학 교재를 호스팅하는 SvelteKit 기반 웹 플랫폼입니다. GitHub 저장소에서 Markdown 기반 교재를 직접 렌더링하고 Lunr 검색 인덱스를 제공합니다.

## 핵심 아키텍처

### 디렉토리 구조
- `src/routes/` - SvelteKit 라우트
  - `+page.svelte` - 메인 페이지 (교재 목록)
  - `+layout.server.ts` - 세션 정보 로드
  - `books/[bookId]/` - 개별 교재 뷰어
    - `+page.svelte` - Markdown 렌더링 및 네비게이션
    - `+page.server.ts` - Markdown 파일 로드 및 mdsvex 컴파일
  - `builds/` - 빌드 로그 페이지 (chaek-union 멤버 전용)
  - `api/webhook/` - GitHub webhook 엔드포인트
  - `api/books/[bookId]/search/` - Lunr 검색 API
  - `api/builds/` - 빌드 로그 API
- `src/lib/server/` - 서버 전용 모듈
  - `db/` - PostgreSQL 데이터베이스 모듈
    - `index.ts` - DB 연결 및 쿼리 헬퍼
    - `users.ts` - 사용자 관리
    - `builds.ts` - 빌드 로그 관리
    - `schema.sql` - DB 스키마 정의
  - `books.ts` - 교재 목록 및 메타데이터 관리
  - `compiler.ts` - Git 클론 및 Lunr 인덱스 빌드 (빌드 로그 DB 저장)
  - `summary-parser.ts` - SUMMARY.md 파싱 및 네비게이션 생성
- `src/lib/components/` - Svelte 컴포넌트
  - `Navbar.svelte` - 네비게이션 바
  - `LanguageSwitcher.svelte` - 드롭다운 언어 선택기
  - `BookCard.svelte` - 교재 카드 컴포넌트
  - `BottomBar.svelte` - 하단 바 (관리자 로그인)
- `src/hooks.server.ts` - Auth.js 인증 및 정적 파일 서빙 (assets)
- `books/` - 클론된 Git 저장소 (gitignored)
- `static/books/` - 생성된 Lunr 검색 인덱스 (gitignored)
- `static/book-viewer.css` - 교재 뷰어 전용 CSS

### 주요 플로우

1. **GitHub OAuth 인증**
   - `hooks.server.ts`에서 Auth.js 설정
   - GitHub OAuth로 로그인
   - `chaek-union` 조직 멤버십 확인 (Octokit API 사용)
   - 사용자 정보를 PostgreSQL에 저장/업데이트

2. **GitHub Webhook → Lunr 인덱스 빌드**
   - `chaek-union` 조직의 저장소에서 push 발생
   - `/api/webhook` 엔드포인트가 이벤트 수신
   - `compiler.ts`가 빌드 로그 생성 (DB)
   - 저장소 클론/업데이트
   - `SUMMARY.md` 파싱하여 모든 Markdown 파일 수집
   - Lunr 검색 인덱스 생성하여 `static/books/{repo-name}/search-index.json`에 저장
   - 빌드 결과를 DB에 저장

3. **교재 목록 표시**
   - `books.ts`가 `books/` 디렉토리 스캔
   - `SUMMARY.md` 또는 `book.json`이 있는 교재만 목록에 표시
   - 한국어/영어 다국어 지원

4. **교재 읽기**
   - `/books/{bookId}?path={file.md}` 라우트로 접근
   - `+page.server.ts`에서 Markdown 파일을 읽고 mdsvex로 HTML 컴파일
   - 상대 경로 이미지/링크를 절대 경로로 재작성
   - 사이드바에 SUMMARY.md 기반 네비게이션 표시
   - 클릭 시 SvelteKit `goto()`로 페이지 전환 (URL 업데이트)

5. **검색 기능**
   - 사이드바 검색창에서 검색어 입력
   - `/api/books/[bookId]/search?q={query}` API 호출
   - Lunr 인덱스를 사용한 전문 검색 (와일드카드 및 퍼지 매칭 지원)
   - 검색 결과 클릭 시 해당 페이지로 이동

6. **빌드 로그 조회** (chaek-union 멤버 전용)
   - `/builds` 페이지에서 모든 교재의 빌드 로그 조회
   - 빌드 클릭 시 상세 로그 표시

## 기술 스택

- **프론트엔드**: SvelteKit 2, TypeScript, Svelte 5
- **백엔드**: Node.js (SvelteKit API routes)
- **데이터베이스**: PostgreSQL 16 (Docker Compose로 제공)
- **인증**: Auth.js (GitHub OAuth)
- **Markdown 처리**: mdsvex, markdown-it, rehype-slug, rehype-autolink-headings
- **검색**: Lunr.js
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

### 빌드 프로세스 (변경됨: HonKit → Lunr)
- **이전**: HonKit으로 정적 HTML 빌드
- **현재**: Lunr 검색 인덱스만 빌드
- 빌드는 비동기로 실행 (webhook 응답을 블로킹하지 않음)
- 빌드 시작 시 DB에 로그 생성 (status: 'running')
- `SUMMARY.md` 파싱하여 모든 Markdown 파일 수집
- 각 파일을 읽고 Lunr 인덱스에 추가
- `static/books/{book-id}/search-index.json`에 인덱스 저장
- 빌드 완료 시 stdout/stderr와 함께 상태 업데이트

### Markdown 렌더링
- 서버 측에서 mdsvex를 사용하여 Markdown을 HTML로 컴파일
- 상대 경로 이미지(`../assets/images/file.png`)를 절대 경로로 재작성
- 자산(assets) 파일은 `hooks.server.ts`의 정적 파일 핸들러로 서빙
- `book.json`의 `root` 속성을 확인하여 올바른 경로 사용

### 교재 저장소 요구사항
- `SUMMARY.md` 필수 (GitBook/HonKit 형식)
- `book.json` 선택사항 (root 디렉토리 지정 가능)
- Markdown 파일 (`.md`)로 구성
- `chaek-union` GitHub 조직에 속해야 함

### book.json 형식
```json
{
  "title": "교재 제목",
  "root": "./docs"  // 선택사항, 기본값 "."
}
```

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
- 하단 바 (관리자 로그인)

### 교재 뷰어
- 왼쪽 사이드바: SUMMARY.md 기반 네비게이션 + 검색
- 오른쪽 메인 영역: Markdown 콘텐츠
- 커스텀 스타일링 (`/static/book-viewer.css`)
- 링크 클릭 시 SvelteKit 네비게이션 (URL 업데이트)

### 검색 기능
- 실시간 검색 (300ms 디바운스)
- Lunr 인덱스 기반 전문 검색
- 와일드카드 및 퍼지 매칭 지원
- 검색 결과 클릭 시 해당 페이지로 이동

## 알려진 제약사항

1. 교재는 반드시 `chaek-union` 조직에 속해야 함
2. 교재 메타데이터는 파일시스템 기반 (book.json 파싱)
3. 동시 빌드 시 충돌 가능성 (락 메커니즘 없음)
4. 검색 인덱스는 빌드 시에만 업데이트됨 (실시간 아님)

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
