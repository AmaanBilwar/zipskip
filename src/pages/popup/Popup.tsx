import React, { useState } from 'react';

export default function Popup() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAuth = () => {
    setLoading(true);
    setError(null);
    
    chrome.runtime.sendMessage({ action: 'get_oauth_token' }, (response) => {
      setLoading(false);
      if (response?.error) {
        setError(response.error);
      } else if (response?.token) {
        setToken(response.token);
      }
    });
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
      )}
      {error && (
        <p style={{ color: 'red', marginTop: '10px' }}>
          Error: {error}
        </p>
      )}
    </div>
  );
}
