import React, { useState, useEffect } from 'react';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  iconLink?: string;
}

export default function Popup() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string>('root');
  const [folderStack, setFolderStack] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fetching, setFetching] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

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

  // Fetch files/folders in the current folder
  useEffect(() => {
    if (!token) return;
    setFetching(true);
    setError(null);
    fetch(
      `https://www.googleapis.com/drive/v3/files?q='${currentFolder}'+in+parents+and+trashed=false&fields=files(id%2Cname%2CmimeType%2CiconLink)&pageSize=100`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch files');
        return res.json();
      })
      .then((data) => {
        setFiles(data.files || []);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setFetching(false));
  }, [token, currentFolder]);

  const handleEnterFolder = (id: string) => {
    setFolderStack((stack) => [...stack, currentFolder]);
    setCurrentFolder(id);
  };

  const handleGoBack = () => {
    setCurrentFolder((prev) => {
      const stack = [...folderStack];
      const prevFolder = stack.pop() || 'root';
      setFolderStack(stack);
      return prevFolder;
    });
  };

  const handleSelect = (id: string) => {
    setSelected((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const downloadFiles = async (fileIds: string[]) => {
    if (!token) return;
    
    setDownloading(true);
    setError(null);
    setDownloadProgress({});

    try {
      // First, get the file metadata for all selected files
      const filePromises = fileIds.map(async (fileId) => {
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!response.ok) throw new Error(`Failed to fetch file metadata for ${fileId}`);
        return response.json();
      });

      const fileMetadata = await Promise.all(filePromises);

      // Now download each file
      const downloadPromises = fileMetadata.map(async (file) => {
        try {
          // For Google Docs/Sheets/etc, we need to export them
          if (file.mimeType.startsWith('application/vnd.google-apps.')) {
            const exportMimeType = getExportMimeType(file.mimeType);
            const response = await fetch(
              `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${exportMimeType}`,
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );
            if (!response.ok) throw new Error(`Failed to export ${file.name}`);
            const blob = await response.blob();
            downloadBlob(blob, `${file.name}.${getFileExtension(exportMimeType)}`);
          } else {
            // For regular files, use the download URL
            const response = await fetch(
              `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );
            if (!response.ok) throw new Error(`Failed to download ${file.name}`);
            const blob = await response.blob();
            downloadBlob(blob, file.name);
          }
          setDownloadProgress(prev => ({ ...prev, [file.id]: 100 }));
        } catch (err) {
          console.error(`Error downloading ${file.name}:`, err);
          setError(`Failed to download ${file.name}`);
        }
      });

      await Promise.all(downloadPromises);
    } catch (err) {
      console.error('Download error:', err);
      setError('Failed to download files');
    } finally {
      setDownloading(false);
    }
  };

  const getExportMimeType = (mimeType: string): string => {
    const mimeTypeMap: Record<string, string> = {
      'application/vnd.google-apps.document': 'application/pdf',
      'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.google-apps.presentation': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.google-apps.drawing': 'image/png',
    };
    return mimeTypeMap[mimeType] || 'application/pdf';
  };

  const getFileExtension = (mimeType: string): string => {
    const extensionMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'image/png': 'png',
    };
    return extensionMap[mimeType] || 'pdf';
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '20px', width: '320px', fontSize: 14 }}>
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
        <>
          <p style={{ color: 'green' }}>✓ Successfully connected to Google Drive</p>
          <button 
            onClick={() => setToken(null)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: 10
            }}
          >
            Disconnect
          </button>
          <div style={{ margin: '10px 0', minHeight: 180, border: '1px solid #eee', borderRadius: 4, background: '#fafbfc', padding: 8 }}>
            {fetching ? (
              <div>Loading files...</div>
            ) : (
              <>
                {currentFolder !== 'root' && (
                  <div style={{ marginBottom: 8 }}>
                    <button onClick={handleGoBack} style={{ fontSize: 13, color: '#4285f4', background: 'none', border: 'none', cursor: 'pointer' }}>⬅️ Up one level</button>
                  </div>
                )}
                {files.length === 0 ? (
                  <div>No files or folders found.</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {files.map((file) => (
                      <li key={file.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                        {file.mimeType === 'application/vnd.google-apps.folder' ? (
                          <span style={{ cursor: 'pointer', color: '#4285f4', marginRight: 6 }} onClick={() => handleEnterFolder(file.id)}>
                            📁
                          </span>
                        ) : (
                          <span style={{ marginRight: 6 }}>📄</span>
                        )}
                        <span style={{ flex: 1, cursor: file.mimeType === 'application/vnd.google-apps.folder' ? 'pointer' : 'default' }}
                          onClick={file.mimeType === 'application/vnd.google-apps.folder' ? () => handleEnterFolder(file.id) : undefined}
                        >
                          {file.name}
                        </span>
                        <input
                          type="checkbox"
                          checked={selected.has(file.id)}
                          onChange={() => handleSelect(file.id)}
                          style={{ marginLeft: 8 }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          {selected.size > 0 && (
            <div style={{ marginTop: 10 }}>
              <b>Selected IDs:</b>
              <div style={{ wordBreak: 'break-all', fontSize: 12 }}>{Array.from(selected).join(', ')}</div>
              <button
                style={{
                  marginTop: 8,
                  padding: '8px 16px',
                  backgroundColor: '#4285f4',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: downloading ? 'not-allowed' : 'pointer',
                  width: '100%',
                  opacity: downloading ? 0.7 : 1
                }}
                onClick={() => {
                  if (!downloading) {
                    downloadFiles(Array.from(selected));
                  }
                }}
                disabled={downloading}
              >
                {downloading ? 'Downloading...' : 'Download'}
              </button>
              {Object.keys(downloadProgress).length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  {Object.entries(downloadProgress).map(([fileId, progress]) => (
                    <div key={fileId} style={{ marginBottom: 4 }}>
                      {files.find(f => f.id === fileId)?.name}: {progress}%
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <p style={{ color: 'red', marginTop: '10px' }}>
          Error: {error}
        </p>
      )}
    </div>
  );
}
