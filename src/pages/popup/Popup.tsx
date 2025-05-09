import React, { useState, useEffect } from 'react';

declare global {
  interface Window {
    google: any;
    gapi: any;
  }
}

export default function Popup() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickerInitialized, setPickerInitialized] = useState(false);

  useEffect(() => {
    // Load Google Picker API script
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      console.log('Google API script loaded');
      window.gapi.load('picker', () => {
        console.log('Picker API loaded');
        setPickerInitialized(true);
      });
    };
    script.onerror = (error) => {
      console.error('Error loading Google API script:', error);
      setError('Failed to load Google API');
    };
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  const handleAuth = () => {
    setLoading(true);
    setError(null);
    
    chrome.runtime.sendMessage({ action: 'get_oauth_token' }, (response) => {
      setLoading(false);
      if (response?.error) {
        console.error('Auth error:', response.error);
        setError(response.error);
      } else if (response?.token) {
        console.log('Token received successfully');
        setToken(response.token);
      }
    });
  };

  const showPicker = () => {
    console.log('Show picker called');
    console.log('Token:', token);
    console.log('Picker initialized:', pickerInitialized);
    
    if (!token) {
      console.error('No token available');
      setError('Please connect to Google Drive first');
      return;
    }
    
    if (!pickerInitialized) {
      console.error('Picker not initialized');
      setError('Google Picker is not ready yet. Please try again in a moment.');
      return;
    }

    try {
      const picker = new window.google.picker.PickerBuilder()
        .addView(window.google.picker.ViewId.DOCS)
        .addView(window.google.picker.ViewId.FOLDERS)
        .setOAuthToken(token)
        .setDeveloperKey(process.env.GOOGLE_API_KEY)
        .setCallback((data: any) => {
          console.log('Picker callback data:', data);
          if (data.action === window.google.picker.Action.PICKED) {
            const selectedItems = data.docs;
            console.log('Selected items:', selectedItems);
            // Handle selected items here
            // You can send them to your background script or process them as needed
          }
        })
        .build();
      picker.setVisible(true);
    } catch (error) {
      console.error('Error creating picker:', error);
      setError('Failed to create file picker. Please try again.');
    }
  };

  return (
    <div style={{ padding: '20px', width: '300px' }}>
      <h1>ZipSkip</h1>
      {!token ? (
        <button 
          onClick={handleAuth}
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: '#4285f4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Connecting...' : 'Connect to Google Drive'}
        </button>
      ) : (
        <div>
          <p style={{ color: 'green' }}>✓ Successfully connected to Google Drive</p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button 
              onClick={showPicker}
              disabled={!pickerInitialized}
              style={{
                padding: '8px 16px',
                backgroundColor: '#4285f4',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Select Files/Folders
            </button>
            <button 
              onClick={() => setToken(null)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
      {error && (
        <p style={{ color: 'red', marginTop: '10px' }}>
          Error: {error}
        </p>
      )}
    </div>
  );
}
