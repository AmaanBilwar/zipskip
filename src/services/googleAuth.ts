export const initiateGoogleAuth = () => {
  const clientId = '32903464060-ovhld6tmqgsj1kgg2dt8jrhr2fv9namg.apps.googleusercontent.com';
  const redirect = 'https://zipskip.vercel.app/oauth2/callback';
  const scope = 'https://www.googleapis.com/auth/drive.readonly';

  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth' +
    `?client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    '&response_type=token' +
    `&scope=${encodeURIComponent(scope)}` +
    '&prompt=consent';

  window.open(authUrl, 'zipship_login', 'width=500,height=650');

  window.addEventListener('message', (e) => {
    if (e.data?.type === 'google-auth-token') {
      const token = e.data.token;
      // store it and hit Drive API
      chrome.storage.local.set({ gdriveToken: token });
    }
  });
}; 