# 첫 화면 그림

`breeze-day` 는 세로 화면용(900×1600), `breeze-day-wide` 는 가로 화면용(1920×1080)
입니다. 어느 쪽을 쓸지는 `styles/base.css` 의 `@media (min-aspect-ratio:4/3)` 이
고릅니다. **이 그림은 첫 화면에서만 씁니다** — 본문 배경으로는 절대 쓰지 않습니다.

## 왜 avif · webp 두 벌인가

한 벌만 받습니다. CSS 가 `image-set` 으로 골라 주고, `image-set` 을 모르는 낡은
브라우저는 그 앞줄의 webp 에서 멈춥니다. jpeg 는 두지 않습니다 — webp 를 못 읽는
브라우저(iOS 13 이하)는 이제 사실상 없고, 그 경우에도 하늘색 바탕(`--brand-sky`)이
1.6초 동안 깔릴 뿐입니다.

| | 예전 jpeg | 지금 avif | 지금 webp |
| --- | --- | --- | --- |
| breeze-day (900×1600) | 245KB | 69KB | 91KB |
| breeze-day-wide (1920×1080) | 331KB | 91KB | 122KB |

## 만드는 법

원본 jpeg 두 장(저장소 이력에 있습니다)에서 [sharp](https://sharp.pixelplumbing.com)
로 굽습니다. 앱에는 sharp 를 넣지 않습니다 — 그림을 바꿀 때만 쓰는 도구라서,
그때 한 번 `npx` 로 부릅니다.

```js
const base = sharp(src).sharpen({ sigma: 1.0, m1: 0, m2: 2.4, x1: 2, y2: 12 });
await base.clone().avif({ quality: 55, effort: 9, chromaSubsampling: '4:4:4' }).toFile(out + '.avif');
await base.clone().webp({ quality: 80, effort: 6, smartSubsample: true }).toFile(out + '.webp');
```

`sharpen` 은 화면에서 한 번 더 확대되는 것을 감안한 출력 선명화입니다. 없던 결을
만들지는 않고, 있는 결이 확대를 견디게 합니다. 하늘 그라데이션이 넓어서
`4:4:4`(색을 줄이지 않음)로 굽습니다 — 여기서 색을 반으로 줄이면 파랑이 뭉칩니다.

## 알아 둘 것: 이 그림의 실제 해상도

적혀 있는 크기는 900×1600 이지만, 그 안에 든 정보는 그 절반쯤(≈450×800)입니다.
줄였다 되키워도 원본과 거의 같기 때문입니다(JPEG 잡티를 걷어내고 비교하면 41dB —
눈으로 구분 불가). 저장하기 전에 이미 한 번 확대된 그림이라는 뜻입니다.

그래서 요즘 휴대폰(1170×2532)에서는 확대가 두 번 겹칩니다. 파일 크기를 키워도
이건 나아지지 않습니다 — **그림을 더 큰 크기로 다시 그려야** 나아집니다. 2배
(1800×3200 / 3840×2160)로 다시 뽑아 온다면 위 설정 그대로 구웠을 때 avif 로
150–200KB 쯤 될 것으로 봅니다. 지금 jpeg(245KB · 331KB)보다도 가볍습니다.
