# 앱인토스용 Breeze

토스 미니앱은 웹·iOS·Android와 같은 코드에서 따로 묶습니다. 이 묶음만 `window.BREEZE_TARGET`이 `'toss'`입니다. 그 값이 없으면 기존 앱 동작은 그대로입니다.

## 이 빌드에 있는 것

- 고전 책 읽기. 원격 고전 목록과 앱에 들어 있는 셜록 홈즈입니다.
- 단어를 눌러 뜻 보기. 뜻은 기존 Supabase `dict` 함수로 가져옵니다.
- 단어장. 단어와 읽던 위치는 이 기기(IndexedDB, localStorage)에만 저장합니다.

## 이 빌드에 없는 것

- 이메일, Apple, Google 로그인과 입장 시 로그인 시트
- PDF, EPUB, TXT, 기사 가져오기
- 바깥 링크, 앱스토어·설치 안내, breeze.io.kr 공유
- 다크 모드, 서비스 워커
- 책 클라우드와 필기 동기화

## 만드는 법

```bash
npm run toss
```

결과 폴더는 `toss/dist`입니다. 앱 코드는 이 폴더 안에 있고, 화면은 원격 페이지를 열지 않습니다. 고전 목록과 사전은 Supabase로 데이터를 요청합니다.

`.ait` 패키지:

```bash
npm run toss:ait
```

`apps-in-toss.config.ts`의 `appName`은 `breeze`입니다. 콘솔에 등록한 앱 아이디와 같아야 합니다. 화면에 보이는 이름은 콘솔에서 정합니다.

이 패키지는 `@apps-in-toss/web-framework` 3.9.0을 씁니다. 이 작업 환경의 Node.js 22.23.4에서 `npm run toss:ait`가 끝났고, 저장소 루트에 `breeze.ait`(약 22MB)가 만들어졌습니다. 그 파일은 생성물이라 git에 넣지 않습니다. `@apps-in-toss/ait-format`은 Node.js 24 이상을 적지만, 이번 빌드는 그 경고 뒤에도 패키지를 만들었습니다. 다른 컴퓨터에서 CLI가 거부하면 Node.js 24에서 같은 명령을 다시 실행합니다.

## 사용자 식별

v1은 서버 동기화를 하지 않습니다. 미니앱이 켜질 때 `User.getAnonymousKey()`를 한 번 부르고, 그 해시를 `localStorage` 키 `breeze.toss.anon-key`에만 둡니다. 이 값을 Supabase로 보내지 않습니다.

`anonKey` 검증은 그 키가 이 미니앱에 대해 발급됐다는 것만 확인합니다. 요청한 사람이 그 사용자라는 신원 증명은 아닙니다. 이 값으로 사용자 행을 열거나 RLS를 통과시키면 안 됩니다. 그래서 단어장과 읽기 위치는 기기에만 둡니다.

사전 호출은 기존 공개 anon 키로 `/functions/v1/dict`에 데이터를 요청합니다. 토스 사용자 해시와는 별개입니다.

## CORS

지금 `dict` 함수는 `Access-Control-Allow-Origin: *`입니다. 이 빌드는 그 설정을 바꾸지 않습니다. 와일드카드를 치우고 출처를 직접 적는다면, 아래 네 곳을 허용해야 합니다.

SDK 3.1.0 이상(이 패키지의 3.9.0)에서 실제로 열리는 주소:

- `https://breeze.apps.tossmini.com`
- `https://breeze.private-apps.tossmini.com`

SDK 3.0.0 이상 3.1.0 미만에서 쓰이던 주소:

- `https://breeze.web.tossmini.com`
- `https://breeze.private-web.tossmini.com`

`breeze`는 콘솔 앱 아이디입니다. 아이디를 바꾸면 호스트도 바뀝니다. 3.0대 번들이 같이 돌 수 있으면 네 곳 모두 등록합니다.

## 내비게이션과 표시

토스 내비게이션 바를 씁니다. 읽기, 단어장, 온보딩의 자체 뒤로 버튼은 이 빌드에서 숨깁니다. 첫 화면에서 뒤로 가면 미니앱이 닫히고, 그 안의 층은 먼저 닫힙니다. Android 시스템 뒤로도 같은 `backEvent`입니다. 라이트 모드만 켜고, 핀치 확대는 뷰포트에서 이미 잠가 두었습니다.

인공지능이 만든 뜻을 처음 보여줄 때 안내를 한 번 띄우고, 그 뜻에는 `AI` 배지를 붙입니다. 직접 고친 뜻에는 배지를 붙이지 않습니다.

## 테스트

```bash
npm run test:toss
```

전체 `npm test` 끝에도 같은 검사가 붙어 있습니다.
