<img src="docs/assets/noriverse-icon.png" alt="" width="128" height="128">

# Noriverse · 놀이버스

설치와 회원가입 없이 친구를 초대하고, 같은 방에서 여러 게임을 즐기는 브라우저 게임 플랫폼입니다.

## 로컬 개발 및 실행

Node.js 24를 사용합니다. 의존성을 설치한 뒤 웹 앱과 로컬 방 서비스를 별도 터미널에서 실행합니다.

```powershell
npm ci
npm run dev:rooms
# 새 터미널
npm run dev
```

[http://127.0.0.1:5173/](http://127.0.0.1:5173/)에서 게임을 골라 상세와 설정을 거쳐 시작할 수 있습니다. **혼자하기**를 선택하면 혼자 양쪽을 연습하거나 한 기기에서 두 사람이 번갈아 플레이합니다. 오목과 오델로는 **방 만들기**로 온라인에서 친구와 대전할 수 있습니다. 두 번째 창에서 초대 링크나 코드로 참가하면 호스트가 게임을 시작할 수 있습니다. 로컬 방 서비스는 Wrangler로 실행되며 계정 없이 SQLite Durable Object를 모의 실행합니다.

오른쪽 상단 톱니 버튼에서 언어, 테마, 배경음과 효과음 크기를 조절할 수 있습니다. 배경음과 효과음은 첫 상호작용 이후 브라우저에서 합성되며 설정은 브라우저에 저장됩니다.

첫 방문에 이름을 저장하면 익명 프로필을 만들 수 있습니다. 오른쪽 상단 프로필에서 누적 시간, 게임별 전적과 공유 링크를 확인합니다. 레벨은 1에서 시작해 기록된 플레이 시간을 합산해 한 시간마다 오릅니다. 승률은 승리 수를 승리·패배·무승부의 합으로 나눕니다. 프로필과 경기 기록은 로컬 Wrangler의 SQLite 저장소에, 편집 권한은 해당 브라우저의 쿠키에 있습니다.

라이브러리에서 한글 또는 영문 이름으로 게임을 찾을 수 있습니다. 카드를 선택하면 목록 위 미리보기에 규칙과 플레이 버튼이 표시됩니다. 경기 중에는 보드 위 진행 정보 버튼에서 턴, 점수와 초 단위 플레이 시간을 확인하고, 경기 종료 후에는 보드를 유지한 채 결과 팝업이 열립니다. 하트를 누른 게임은 라이브러리의 즐겨찾기 탭과 프로필에 표시됩니다.

규칙과 프로토콜 테스트는 `npm test`, 타입 확인과 번들은 `npm run build`로 실행합니다.

## 프로젝트 문서

- [서비스 기획과 벤치마킹](docs/product.md)
- [기술 설계와 인프라 검토](docs/technical-design.md)
- [로드맵과 Phase 1 검증 기준](docs/roadmap.md)

## GitHub Pages 첫 배포

1. 공개 GitHub 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다. [GitHub Pages 설정 문서](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
2. 친구 방·프로필·즐겨찾기도 함께 열려면 프로젝트 루트에서 Cloudflare 계정에 `npm exec -- wrangler login`으로 로그인한 뒤 `npm exec -- wrangler deploy`를 실행합니다. [`wrangler.jsonc`](wrangler.jsonc)의 `APP_ORIGIN`은 `https://artrointel.github.io`로 설정되어 있습니다. 저장소 소유자나 Pages 도메인을 바꾸면 `/Noriverse/` 같은 경로를 제외한 새 Pages 출처를 입력합니다. SQLite Durable Objects는 Workers Free 플랜에서도 사용할 수 있습니다. [Wrangler 문서](https://developers.cloudflare.com/workers/wrangler/commands/) · [Durable Objects 요금](https://developers.cloudflare.com/durable-objects/platform/pricing/)
3. Worker를 배포했다면 GitHub 저장소의 **Settings → Secrets and variables → Actions → Variables → New repository variable**에서 `NORIVERSE_API_ORIGIN`을 추가합니다. 값은 배포 명령이 출력한 Worker의 HTTPS 출처입니다. 이 변수를 비워두면 라이브러리와 한 기기 플레이를 먼저 공개할 수 있습니다. 변수를 나중에 추가하거나 변경하면 워크플로를 다시 실행합니다. [GitHub Actions 변수 문서](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables)
4. 변경 사항을 `main`에 푸시합니다. 이미 반영했다면 **Actions → GitHub Pages → Run workflow**에서 `main`을 선택합니다. [배포 워크플로](.github/workflows/pages.yml)는 테스트, 프런트엔드 빌드, Pages 배포를 실행합니다. 성공하면 [놀이버스 GitHub Pages](https://artrointel.github.io/Noriverse/)에서 라이브러리와 로컬 플레이를 열어봅니다. Worker를 연결했다면 두 브라우저로 초대 링크 참가와 프로필 저장도 확인합니다.

Pages 빌드는 저장소 하위 경로에서 에셋을 불러오고, 초대·프로필·게임 링크를 새로고침해도 같은 화면이 열리도록 해시 라우팅을 사용합니다.

동일 출처에서는 HttpOnly 쿠키를 사용합니다. Pages와 Worker를 서로 다른 출처로 운영할 때는 Pages의 퍼스트파티 쿠키에 익명 세션을 저장하고 Worker 요청에 전달합니다. Worker는 지정된 Pages 출처만 허용합니다. 로컬 Wrangler의 기록과 배포된 Worker의 기록은 별개입니다.

저장소 코드는 [MIT 라이선스](LICENSE)를 적용합니다. 이후 비공개로 전환해도 이미 MIT로 배포한 버전의 권한은 유지됩니다.
