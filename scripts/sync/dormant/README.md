# 잠든 동기화 코드

이 폴더의 `vault-recovery.js`는 예전에 `scripts/sync/sync.js` 안에 있던 코드입니다. 앱은 이 파일을 읽지 않습니다. 설정 화면에 단추로 연결되어 있지 않고, 아이폰·안드로이드 앱 묶음에도 넣지 않습니다.

## 무엇을 하던 코드인가

세 가지입니다.

- 복구키. 단어 보관함 열쇠를 만들어 보여주고, 다른 기기에서 그 키로 다시 엽니다.
- 기기 연결. 6자리 코드나 QR로 이전 기기의 열쇠를 넘깁니다.
- 읽기 백업. 책, 원문, 사진, 읽던 자리를 암호화한 압축 파일로 내보내고 다시 불러옵니다.

단어장을 계정에 맞추는 지금 동기화와는 다른 길입니다. 지금 동기화는 `scripts/sync/sync.js`에 그대로 있습니다.

## 왜 잠들어 있나

설정 화면은 계정과 단어장만 보여 줍니다. 이 코드의 화면을 그리는 `recoveryPanel`과, 백업을 만드는 `exportReadingBackup`은 지우기 전에도 아무도 호출하지 않았습니다. 파일을 고르는 숨은 칸만 페이지에 남아 있었습니다. 그대로 두면 쓰이지 않는 길이 단어장 동기화 옆에 붙어, 나중에 고칠 때 엉뚱한 곳을 건드리기 쉽습니다.

저장된 단어장 형식과 지금 맞추는 방식은 바꾸지 않았습니다. 예전 암호화 단어장을 열쇠가 남은 기기에서 옮기는 코드도 `sync.js`에 남아 있습니다.

## 어떻게 되돌리나

이 파일을 `index.html`의 script로 넣지 마세요. 넣으면 앱이 없는 입력칸을 찾다가 멈춥니다. 네이티브 묶음에서 이 폴더를 빼 둔 이유도 같습니다.

다시 쓰려면 다음을 함께 되돌리세요.

1. `vault-recovery.js` 안의 `let` 두 줄과 함수들을 `scripts/sync/sync.js`로 옮깁니다. 파일을 통째로 붙이지 마세요. 맨 위의 묶음 함수는 호출되지 않게 감싼 껍질입니다.
2. `resetSyncSession` 안에 파일 맨 위 주석의 세 줄을 다시 넣습니다. `clearInterval(pairingPoll)`, `pendingPair=null`, `pendingRecoveryKey=''` 입니다.
3. `index.html`에 숨은 파일 입력 두 개를 다시 넣습니다. `recovery-fileinput`, `reading-backup-input` 입니다.
4. 설정 화면을 그릴 때 `recoveryPanel()`을 실제로 호출해야 복구키와 기기 연결이 보입니다. 백업은 `exportReadingBackup`과 `pickReadingBackup`을 단추에 붙여야 합니다. 지우기 전에는 그 호출이 없었습니다.
5. 화면 모양은 `styles/components.css`, `styles/home-shell.css`, `styles/surfaces.css`에서 뺀 `.sm-vault`, `.sm-recovery-actions`, `.sm-device-move` 규칙을 되돌려야 합니다. 그 규칙은 이 변경 직전의 그 파일들에 있습니다.

되돌린 뒤에는 이 폴더를 비워서, 같은 코드가 두 곳에 남지 않게 합니다.
