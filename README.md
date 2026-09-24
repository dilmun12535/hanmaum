# 한마음 업무포탈 - Firestore 계획서 이전 수정본

- 기존 DB 엑셀의 `급여제공계획서` 시트를 Firestore로 **1건씩 순차 이전**합니다.
- 진행상황을 `현재 / 전체`, 성공/실패 건수로 표시합니다.
- 같은 `id`는 덮어써 중복 생성되지 않습니다.
- 대용량 오류를 줄이기 위해 `rowsJson`과 `rows`를 중복 저장하지 않고 Firestore에는 `rows`만 저장합니다.
- 신규 계획서 등록도 동일하게 `rows`만 저장합니다.


## 상담일지 Firestore 전환
- 상담일지 보관함 조회/등록/삭제를 Firestore `counsels` 컬렉션으로 전환했습니다.
- 기존 Google Sheets DB 엑셀의 `상담일지` 시트를 1회 이전할 수 있습니다.
- 이전 시 기존 Firebase 자료를 삭제하지 않으며, 행 번호를 문서 ID에 포함해 여러 상담일지가 덮어써지지 않게 저장합니다.
- 제공확인 페이지는 `HanmaumFirestore.counsels()`를 통해 같은 `counsels` 컬렉션을 조회합니다.
