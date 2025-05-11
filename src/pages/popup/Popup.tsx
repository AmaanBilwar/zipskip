import React, { useState, useEffect } from 'react';
import { 
  Button, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions,
  LinearProgress,
  Box,
  Typography,
  IconButton,
  Tooltip,
  Paper
} from '@mui/material';
import { FolderOpen, FileDownload, ArrowBack, CheckBox, CheckBoxOutlineBlank, Download } from '@mui/icons-material';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  iconLink?: string;
  parents?: string[];
}

export default function Popup() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string>('root');
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fetching, setFetching] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [scanningFolders, setScanningFolders] = useState(false);
  const [folderScanProgress, setFolderScanProgress] = useState<{current: number, total: number} | null>(null);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [downloadPath, setDownloadPath] = useState<string>('');
  const [selectedFilesForDownload, setSelectedFilesForDownload] = useState<string[]>([]);
  const [isSelectingLocation, setIsSelectingLocation] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [currentFolderName, setCurrentFolderName] = useState<string>('My Drive');

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

  const handleEnterFolder = (id: string, name: string) => {
    setFolderStack((stack) => [...stack, { id: currentFolder, name: currentFolderName }]);
    setCurrentFolder(id);
    setCurrentFolderName(name);
  };

  const handleGoBack = () => {
    setCurrentFolder((prev) => {
      const stack = [...folderStack];
      const prevFolder = stack.pop();
      if (prevFolder) {
        setCurrentFolderName(prevFolder.name);
        return prevFolder.id;
      }
      setCurrentFolderName('My Drive');
      return 'root';
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

  const getFolderPath = (folderId: string): string => {
    const path: string[] = [];
    let currentId = folderId;
    
    // Add current folder name
    const currentFile = files.find(f => f.id === currentId);
    if (currentFile) {
      path.unshift(currentFile.name);
    }

    // Add parent folders from stack
    for (let i = folderStack.length - 1; i >= 0; i--) {
      const folder = folderStack[i];
      if (folder.name !== 'root') {
        path.unshift(folder.name);
      }
    }

    return path.join('/');
  };

  const handleDownloadFolder = (folderId: string, folderName: string) => {
    setSelectedFilesForDownload([folderId]);
    downloadFiles([folderId], folderName);
  };

  const downloadFiles = async (fileIds: string[], folderName?: string) => {
    if (!token) return;
    setDownloading(true);
    setError(null);
    setDownloadProgress({});
    setScanningFolders(true);
    setFolderScanProgress(null);

    try {
      // First, get all files including those in folders
      const allFiles = await getAllFiles(fileIds);
      setScanningFolders(false);
      if (allFiles.length === 0) {
        setError('No files found to download');
        return;
      }
      // Now download each file
      const downloadPromises = allFiles.map(async (file) => {
        try {
          let filename = file.name;
          if (folderName) {
            filename = `${folderName}/${filename}`;
          }
          // For Google Docs/Sheets/etc, we need to export them
          if (file.mimeType.startsWith('application/vnd.google-apps.')) {
            const exportMimeType = getExportMimeType(file.mimeType);
            const response = await fetch(
              `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${exportMimeType}`,
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );
            if (!response.ok) throw new Error(`Failed to export ${filename}`);
            const blob = await response.blob();
            downloadBlob(blob, `${filename}.${getFileExtension(exportMimeType)}`);
          } else {
            // For regular files, use the download URL
            const response = await fetch(
              `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
              {
                headers: { Authorization: `Bearer ${token}` },
              }
            );
            if (!response.ok) throw new Error(`Failed to download ${filename}`);
            const blob = await response.blob();
            downloadBlob(blob, filename);
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
      setScanningFolders(false);
      setFolderScanProgress(null);
    }
  };

  const getAllFiles = async (fileIds: string[]): Promise<DriveFile[]> => {
    const allFiles: DriveFile[] = [];
    let totalFolders = 0;
    let processedFolders = 0;
    
    // First count total folders to process
    for (const fileId of fileIds) {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      if (response.ok) {
        const file = await response.json();
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          totalFolders++;
        }
      }
    }
    
    setFolderScanProgress({ current: 0, total: totalFolders });
    
    for (const fileId of fileIds) {
      // Get file metadata
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,parents`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      if (!response.ok) {
        console.error(`Failed to fetch metadata for ${fileId}`);
        continue;
      }
      
      const file = await response.json();
      
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        // If it's a folder, recursively get all files inside
        const folderFiles = await getFilesInFolder(fileId);
        allFiles.push(...folderFiles);
        processedFolders++;
        setFolderScanProgress({ current: processedFolders, total: totalFolders });
      } else {
        allFiles.push(file);
      }
    }
    
    return allFiles;
  };

  const getFilesInFolder = async (folderId: string): Promise<DriveFile[]> => {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    
    do {
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,parents),nextPageToken&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      if (!response.ok) {
        console.error(`Failed to fetch files in folder ${folderId}`);
        break;
      }
      
      const data = await response.json();
      const folderFiles = data.files || [];
      
      // Recursively process subfolders
      for (const file of folderFiles) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          const subfolderFiles = await getFilesInFolder(file.id);
          files.push(...subfolderFiles);
        } else {
          files.push(file);
        }
      }
      
      pageToken = data.nextPageToken;
    } while (pageToken);
    
    return files;
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

  const handleDownloadLocationSelection = async () => {
    setIsSelectingLocation(true);
    try {
      // Create a temporary file to trigger the save dialog
      const tempBlob = new Blob([''], { type: 'text/plain' });
      const tempUrl = URL.createObjectURL(tempBlob);
      
      // Use chrome.downloads.download with saveAs: true to prompt for location
      await new Promise((resolve, reject) => {
        chrome.downloads.download({
          url: tempUrl,
          filename: 'temp.txt',
          saveAs: true,
          conflictAction: 'uniquify'
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            // Get the download item to confirm it was saved
            chrome.downloads.search({ id: downloadId }, (results) => {
              if (results && results[0]) {
                setSelectedLocation(results[0].filename);
                // Cancel the temporary download
                chrome.downloads.cancel(downloadId);
                resolve(downloadId);
              } else {
                reject(new Error('Failed to get download location'));
              }
            });
          }
        });
      });

      // Only proceed with downloads if we have a confirmed location
      if (selectedLocation) {
        setShowFolderDialog(false);
        downloadFiles(selectedFilesForDownload);
      }
    } catch (error) {
      console.error('Error selecting download location:', error);
      setError('Failed to select download location');
    } finally {
      setIsSelectingLocation(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    // Use Chrome's downloads API to download the file
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false, // Don't prompt for each file
      conflictAction: 'uniquify' // Handle filename conflicts
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('Download failed:', chrome.runtime.lastError);
        setError(`Failed to download ${filename}`);
      }
      // Clean up the blob URL
      URL.revokeObjectURL(url);
    });
  };

  return (
    <Box sx={{ 
      padding: '16px', 
      width: '100%',
      minWidth: '350px',
      maxWidth: '480px',
      maxHeight: '700px',
      overflow: 'auto',
      boxSizing: 'border-box',
      '&::-webkit-scrollbar': {
        width: '8px',
      },
      '&::-webkit-scrollbar-track': {
        background: '#f1f1f1',
      },
      '&::-webkit-scrollbar-thumb': {
        background: '#888',
        borderRadius: '4px',
      },
    }}>
      <Typography variant="h5" sx={{ mb: 2 }}>ZipSkip</Typography>
      
      {!token ? (
        <Button 
          variant="contained" 
          color="primary"
          onClick={handleAuth}
          disabled={loading}
          fullWidth
          sx={{ mb: 2 }}
        >
          {loading ? 'Connecting...' : 'Connect to Google Drive'}
        </Button>
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Typography color="success.main" sx={{ flex: 1 }}>✓ Successfully connected to Google Drive</Typography>
            <Button 
              variant="outlined" 
              color="error"
              size="small"
              onClick={() => setToken(null)}
            >
              Disconnect
            </Button>
          </Box>

          <Paper 
            elevation={1} 
            sx={{ 
              p: 2, 
              mb: 2,
              minHeight: '300px',
              maxHeight: '500px',
              overflowY: 'auto',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {fetching ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <LinearProgress sx={{ width: '100%' }} />
              </Box>
            ) : (
              <>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Current Location: {currentFolderName}
                  </Typography>
                  {currentFolder !== 'root' && (
                    <Button
                      startIcon={<ArrowBack />}
                      onClick={handleGoBack}
                      sx={{ mt: 1 }}
                    >
                      Up one level
                    </Button>
                  )}
                </Box>
                {files.length === 0 ? (
                  <Typography color="text.secondary" align="center">
                    No files or folders found.
                  </Typography>
                ) : (
                  <Box>
                    {files.map((file) => (
                      <Box
                        key={file.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          p: 1,
                          '&:hover': {
                            bgcolor: 'action.hover',
                          },
                        }}
                      >
                        <IconButton
                          size="small"
                          onClick={() => file.mimeType === 'application/vnd.google-apps.folder' ? handleEnterFolder(file.id, file.name) : undefined}
                          sx={{ mr: 1 }}
                        >
                          {file.mimeType === 'application/vnd.google-apps.folder' ? <FolderOpen /> : <FileDownload />}
                        </IconButton>
                        <Typography
                          sx={{
                            flex: 1,
                            cursor: file.mimeType === 'application/vnd.google-apps.folder' ? 'pointer' : 'default',
                          }}
                          onClick={() => file.mimeType === 'application/vnd.google-apps.folder' ? handleEnterFolder(file.id, file.name) : undefined}
                        >
                          {file.name}
                        </Typography>
                        {file.mimeType === 'application/vnd.google-apps.folder' && (
                          <Tooltip title="Download this folder">
                            <IconButton
                              size="small"
                              onClick={() => handleDownloadFolder(file.id, file.name)}
                            >
                              <Download />
                            </IconButton>
                          </Tooltip>
                        )}
                        <IconButton
                          size="small"
                          onClick={() => handleSelect(file.id)}
                        >
                          {selected.has(file.id) ? <CheckBox color="primary" /> : <CheckBoxOutlineBlank />}
                        </IconButton>
                      </Box>
                    ))}
                  </Box>
                )}
              </>
            )}
          </Paper>

          {selected.size > 0 && (
            <Paper 
              elevation={2} 
              sx={{ 
                p: 2,
                position: 'sticky',
                bottom: 0,
                bgcolor: 'background.paper',
                borderTop: 1,
                borderColor: 'divider'
              }}
            >
              <Typography variant="subtitle2" gutterBottom>
                Selected: {selected.size} item{selected.size !== 1 ? 's' : ''}
              </Typography>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                startIcon={<FileDownload />}
                onClick={() => {
                  const selectedArray = Array.from(selected);
                  const hasFolders = files.some(f => selected.has(f.id) && f.mimeType === 'application/vnd.google-apps.folder');
                  
                  if (hasFolders) {
                    setSelectedFilesForDownload(selectedArray);
                    setShowFolderDialog(true);
                  } else {
                    downloadFiles(selectedArray);
                  }
                }}
                disabled={downloading || scanningFolders}
              >
                {scanningFolders ? 'Scanning folders...' : downloading ? 'Downloading...' : 'Download'}
              </Button>

              {scanningFolders && folderScanProgress && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Scanning folders: {folderScanProgress.current} of {folderScanProgress.total}
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={(folderScanProgress.current / folderScanProgress.total) * 100}
                    sx={{ mt: 0.5 }}
                  />
                </Box>
              )}

              {Object.keys(downloadProgress).length > 0 && (
                <Box sx={{ mt: 1 }}>
                  {Object.entries(downloadProgress).map(([fileId, progress]) => (
                    <Box key={fileId} sx={{ mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {files.find(f => f.id === fileId)?.name}
                      </Typography>
                      <LinearProgress 
                        variant="determinate" 
                        value={progress}
                        sx={{ mt: 0.5 }}
                      />
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>
          )}
        </>
      )}

      {error && (
        <Typography color="error" sx={{ mt: 2 }}>
          Error: {error}
        </Typography>
      )}
    </Box>
  );
}
