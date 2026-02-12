# 두바이 쫀득 라즈베리파이 프로젝트

두쫀파이 프로젝트는 라즈베리파이 4B에서 돌아가는 간편한 상태 확인 페이지입니다.

## 이름에 대한 이야기

두바이 쫀득 라즈베리파이 라는 이름은 크게 의미가 없습니다. 그냥 제가 좋아하는 단어들을 조합한 것입니다.

## 프로젝트 요청사항

1. 비고
   1. 라즈베리파이 4B의 CPU 사용량, 메모리 사용량, 디스크 사용량, 온도, 쓰로틀링 여부 등을 웹사이트에서 확인할 수 있다.
   2. 별도의 인증 없이 누구나 접속할 수 있다.
2. 측정 (백엔드)
   1. 백엔드는 Fastify로 구현한다.
   2. 측정 정보는 요청 시에만 수집하되, 10초 동안은 같은 값을 반환한다. (10초 동안 여러번 요청하면 1번만 측정)
   3. 단, 일반적으로 변하지 않는 값(e.g. OS, Host 등)은 처음 프로그램이 시작할 때 측정하고 그 값을 계속 사용한다.
   4. `/api/text` 엔드포인트는 하단 수집 및 표시 정보 양식대로 텍스트를 반환한다.
   5. `/api/html` 엔드포인트는 하단 수집 및 표시 정보 양식대로 색을 포함한 HTML을 반환한다. 프론트엔드는 이 엔드포인트를 사용한다. 해당 내용을 그대로 `<pre>` 태그 내에 넣는다. ?icon=false 쿼리 파라미터가 있으면 아이콘을 표시하지 않는다.
   6. `/api/json` 엔드포인트는 하단 수집 및 표시 정보 양식대로 JSON을 반환한다. 이 값은 다른 프로그램에서 사용할 수 있다.
   7. `/health` 엔드포인트는 별도의 내부 로직 없이 항상 200, `{ "ok": true }`를 반환한다.
3. 웹사이트 (프론트엔드)
   1. 백엔드는 HTML, CSS, JS로 구현하며, API 요청은 fetch 를 사용한다.
   2. 프론트엔드는 Fastify의 정적 파일 서빙 기능을 사용한다.
   3. 웹사이트는 10초마다 자동으로 요청을 보내 새로고침한다.
   4. 웹사이트는 매우 심플하고 간결하다.
   5. 화면 중앙에 아래 수집 및 표시 정보 항목을 표시한다.
   6. 항목은 `neofetch`와 같이 색이 있는 monospace font로 표시한다. `<pre>` 태그를 사용한다. 정확한 폰트는 `Menlo, Monaco, 'Courier New', monospace` 를 사용한다.
4. 구동
   1. PM2를 사용하여 프로그램을 구동한다.
   2. PM2는 자동으로 재시작한다.
   3. 포트는 10002번을 사용한다.

## 기술 스택

- Typescript
- Fastify
- HTML, CSS, JS
- PM2
- pnpm

## 수집 및 표시 정보

```
                             ....              ubuntu@ubuntu
              .',:clooo:  .:looooo:.           -------------
           .;looooooooc  .oooooooooo'          OS: Ubuntu 24.04.3 LTS
        .;looooool:,''.  :ooooooooooc          Host: Raspberry Pi 4 Model B Rev 1.4
       ;looool;.         'oooooooooo,          Uptime: 5h 44m
      ;clool'             .cooooooc.  ,,       Datetime: 2026-02-13 04:26:29 (KST)
         ...                ......  .:oo,      IPv4: 192.168.0.100 (wlan0)
  .;clol:,.                        .loooo'     WIFI: Hyuns Wifi 5G - 5 GHz (100%)   // Lan 연결일 경우 LAN: 으로 적절히 표시
 :ooooooooo,                        'ooool     CPU: BCM2711 (4) @ 1.80 GHz - (31%)   // %는 현재 사용량
'ooooooooooo.                        loooo.    Power: 0.9260V - ⚡ Under Voltage [Past/Now]
'ooooooooool                         coooo.    Temp: 54.5°C - 🔥 Overheating [Past/Now]
 ,loooooooc.                        .loooo.    Clock: 1.23 GHz (ondemand) - 🐌 Throttling [Past/Now]
   .,;;;'.                          ;ooooc     Loadavg: 0.15, 0.05, 0.01
       ...                         ,ooool.     Processes: 187
    .cooooc.              ..',,'.  .cooo.      Memory: 1.03 GiB / 3.69 GiB (28%)
      ;ooooo:.           ;oooooooc.  :l.       Swap: 2.50 MiB / 4.00 GiB (0%)
       .coooooc,..      coooooooooo.           Disk: 20.06 GiB / 458.11 GiB (4%) - 🚫 Read Only      // 연결된 메인 디스크
         .:ooooooolc:. .ooooooooooo'           -------------
           .':loooooo;  ,oooooooooc            Version: 1.0.0
               ..';::c'  .;loooo:'             Status: 🍡 Chewy
```

웹사이트는 위와 같이 표시한다. 값은 실제 측정된 값을 사용한다.

- Status: 는 다양한 조건을 종합하여 🍡 Chewy, ⚠️ Warn, 🚨 CRITICAL 로 표시한다.
  - Chewy: 별다른 문제가 없을 때 표시한다. uptime이 7일 이상일 경우 🍡 Super Chewy 로 표시한다.
  - WARN, CRITICAL일 경우 이유를 표시한다. (e.g. `Status: CRITICAL (throttled now, under voltage now, overheating, high load, high disk usage, high swap usage, disk read only)`)
  - WARN 기준: 과거에 쓰로틀링, 과거에 저전압, 현재 온도 60도 이상, 현재 디스크 사용량 70% 이상, 현재 CPU 사용량 80% 이상, 현재 스왑 사용량 80% 이상
  - CRITICAL 기준: 현재 쓰로틀링, 현재 저전압, 현재 온도 70도 이상, 현재 디스크 사용량 90% 이상, 현재 CPU 사용량 90% 이상, 현재 스왑 사용량 90% 이상
- `- ⚡ Under Voltage [Past/Now]`, `- 🌡️ Overheating [Past/Now]`, `- 🐌 Throttling [Past/Now]` 는 각각 과거 또는 현재에 저전압, 과열, 쓰로틀링이 발생했는지 표시한다. 해당 경우가 발생한 경우에만 표시한다.
- `- 🚫 Read Only`는 디스크가 읽기 전용으로 마운트되었는지 표시한다. 해당 경우가 발생한 경우에만 표시한다.

# 라이센스

MIT 라이센스를 적용합니다.
