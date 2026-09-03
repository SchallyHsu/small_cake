export default function manifest() {
  return {
    name: 'MCK Helper Web',
    short_name: 'MCK Helper',
    description: 'Mobile web client for personal PKU WProc bus reservations',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f7fb',
    theme_color: '#5b5bd6',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
