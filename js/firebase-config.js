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
  apiKey: "AIzaSyAncTFNuQ_fn3nFny9wcXSB1Y9Bm7Fo5kU",
  authDomain: "rooms-3a443.firebaseapp.com",
  databaseURL: "https://rooms-3a443-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "rooms-3a443",
  storageBucket: "rooms-3a443.firebasestorage.app",
  messagingSenderId: "925118596629",
  appId: "1:925118596629:web:ab6070398518474484301c",
};

export function isFirebaseConfigured() {
  const c = firebaseConfig;
  return Boolean(c.apiKey && c.databaseURL && c.projectId);
}
