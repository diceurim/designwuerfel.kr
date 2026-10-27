# VS Code에서 주사위 그래픽 적용하기

1. 13_dicerolling/assets 폴더에 각 면 이미지를 넣습니다.
2. 파일명을 face-1.png ~ face-6.png로 지정합니다.
3. sketch.js 맨 위 FACE_IMAGE_PATHS를 아래처럼 변경합니다.

```js
const FACE_IMAGE_PATHS = [
  'assets/face-1.png',
  'assets/face-2.png',
  'assets/face-3.png',
  'assets/face-4.png',
  'assets/face-5.png',
  'assets/face-6.png',
];
```

4. 저장하고 index.html을 Live Server로 실행하거나 새로고침합니다.

각 면은 512×512 또는 1024×1024 정사각형 PNG/JPG/WebP를 권장합니다.
실제 파일명과 확장자를 코드 경로와 맞추세요.
한 면만 적용하려면 해당 위치만 경로로 바꾸고 나머지는 null로 둡니다.
전개도가 한 장이라면 여섯 면을 개별 이미지로 나누어 내보내세요.
반대 면은 1–6, 2–5, 3–4입니다.
PNG 투명 영역은 알파값을 유지해 뒤쪽 장면이 보입니다.
