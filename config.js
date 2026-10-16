/* Breeze 설정 파일 — 이 파일을 복사해 config.js 로 저장하고 값을 채우세요.
   config.js 는 한 번만 서버(깃허브)에 올려두면, index.html 을 아무리 갈아끼워도
   키를 다시 넣을 필요가 없습니다. (anon 키는 공개되어도 안전한 키입니다) */
window.BREEZE_CONFIG = {
  // Warmed WIRED pilot; all other built-ins retain their existing local feed cache.
  RSS_CATALOG: true,
  RSS_CATALOG_FEED_IDS: [7],
  BOOK_CLOUD: true,
  // Public reading cache. Leave this unset until breeze-reading-cache is deployed.
  // Set READING_CACHE_URL to that Worker's https origin to read feeds, articles,
  // images, and invitations from R2. Delete the key to stop those reads on the next load.
  // Pen and highlighter sync for books with 기기 간 연동 on. Set false to stop
  // uploads and remote merges on the next call; local ink stays on the device.
  INK_SYNC: true,
  SB_URL: 'https://hrtfhojbhqvaoiulspto.supabase.co',   // Supabase Project URL  (예: https://xxxx.supabase.co)
  SB_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhydGZob2piaHF2YW9pdWxzcHRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMTM1MTEsImV4cCI6MjEwMDg4OTUxMX0.9LT_ly0fRXhWWFKK4o3ueREeOot8e_qUA9lI1IRANpQ'    // Supabase anon public key
};
