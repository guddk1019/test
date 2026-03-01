# Frontend MVP (Next.js)

사내 업무 성과 관리 시스템 프론트엔드입니다.

## Stack
- Next.js App Router (TypeScript)
- Tailwind CSS
- React Query
- Axios
- Recharts

## 주요 화면
- `/login`: 로그인
- `/work-items`: 직원 업무 목록
- `/work-items/new`: 업무 등록
- `/work-items/:workItemId`: 업무 상세/제출 이력
- `/work-items/:workItemId/submit`: 제출 생성 + 파일 업로드 + finalize
- `/admin`: 관리자 제출 큐 + KPI
- `/admin/work-items/:workItemId`: 제출 상세 검토 + 승인/반려

추가 확장:
- 관리자 대시보드 차트: 상태 분포, 처리시간 버킷, 직원 처리량
- 기간 필터: 7/30/90일, 전체
- 제출 상세 파일 메타: 파일명, 크기, MIME, SHA256
- 차트 드릴다운: 상태 파이 클릭 -> 상태 필터, 직원 바 클릭 -> 담당자 필터

## 인증 / 권한
- 로그인 시 JWT와 사용자 정보를 쿠키에 저장
- `middleware.ts`에서 보호 라우트 접근 제어
- `/admin`은 `ADMIN`만 허용

## 백엔드 API 자동 분석
백엔드 `../src/index.ts`, `../src/routes/*.ts`를 분석해 라우트 맵 생성:

```bash
npm run sync:api
```

생성 파일:
- `src/lib/api/generated-routes.ts`

## 실행 방법
1. 환경 변수 설정
```bash
cp .env.example .env.local
```

2. 의존성 설치
```bash
npm install
```

3. 개발 서버
```bash
npm run dev
```

4. 품질 확인
```bash
npm run lint
npm run build
```

5. UI 스크린샷 자동 캡처
```bash
npm run capture:screenshots
```
출력 경로: `frontend/screenshots/*.png`

## 백엔드 연결 전제
- 백엔드가 `http://localhost:4000`에서 실행 중이어야 합니다.
- 기본 계정(백엔드 seed):
  - 직원: `emp001 / Emp1234!`
  - 관리자: `admin001 / Admin1234!`
