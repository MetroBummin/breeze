const getConfig = () => window.READY_CONFIG || {};

export async function readyApi(op, data = {}, token = '') {
  const { API_URL } = getConfig();
  if (!API_URL) throw new Error('READY config.js의 API_URL을 확인해 주세요.');
  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ op, ...data }),
    });
  } catch {
    throw new Error('READY 서버에 연결할 수 없습니다. 배포 상태와 네트워크를 확인해 주세요.');
  }
  let body;
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) {
    const error = new Error(body.error || `READY 서버 오류 (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}
