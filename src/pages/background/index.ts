// main logic lives here
console.log('background script loaded');

// Google OAuth configuration
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID; // Replace with your Google Cloud Console client ID
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get_oauth_token') {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ token });
    });
    return true; // Required for async sendResponse
  }
});

// Handle OAuth token removal on logout
// chrome.identity.onSignInChanged.addListener((account, signedIn) => {
//   if (!signedIn) {
//     chrome.identity.getAuthToken({ interactive: false }, (token) => {
//       if (token) {
//         chrome.identity.removeCachedAuthToken({ token }, () => {
//           console.log('Token removed');
//         });
//       }
//     });
//   }
// });


