const getConfig = () => window.BREEZE_CONFIG || {};

export async function readyApi(op, data = {}, teacherKey = '') {
  const { SB_URL, SB_KEY } = getConfig();
  if (!SB_URL || !SB_KEY) throw new Error('config.js의 Supabase 설정을 확인해 주세요.');
  let response;
  try {
    response = await fetch(`${SB_URL.replace(/\/$/, '')}/functions/v1/ready`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: SB_KEY,
        authorization: `Bearer ${SB_KEY}`,
        ...(teacherKey ? { 'x-ready-teacher-key': teacherKey } : {}),
      },
      body: JSON.stringify({ op, ...data }),
    });
  } catch {
    throw new Error('READY 서버에 연결할 수 없습니다. 배포 상태와 네트워크를 확인해 주세요.');
  }
  let body;
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) throw new Error(body.error || `READY 서버 오류 (${response.status})`);
  return body;
}
