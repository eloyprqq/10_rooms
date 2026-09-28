// Firebase Realtime Database 설정.
// 콘솔(https://console.firebase.google.com)에서 웹 앱을 추가한 뒤 값을 붙여 넣으세요.
// databaseURL 이 없으면 멀티플레이는 동작하지 않습니다.
//
// 데이터베이스 규칙(테스트용, 친구끼리 플레이):
// {
//   "rules": {
//     "rooms": {
//       ".read": true,
//       ".write": true
//     }
//   }
// }
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

export function isFirebaseConfigured() {
  const c = firebaseConfig;
  return Boolean(c.apiKey && c.databaseURL && c.projectId);
}
