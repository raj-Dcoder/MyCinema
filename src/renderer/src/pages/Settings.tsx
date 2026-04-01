import React, { useEffect, useState } from 'react'
import { FolderOpen, Trash2, Plus, HardDrive } from 'lucide-react'

const Settings: React.FC = () => {
  const [folders, setFolders] = useState<any[]>([])
  const [scanning, setScanning] = useState<string | null>(null)

  const fetchFolders = async () => {
    const f = await window.api.getFolders()
    setFolders(f)
  }

  useEffect(() => {
    fetchFolders()
  }, [])

  const handleAddFolder = async () => {
    const path = await window.api.selectFolder()
    if (!path) return
    setScanning(path)
    await window.api.scanFolder(path)
    await fetchFolders()
    setScanning(null)
  }

  const handleRemoveFolder = async (folderPath: string) => {
    const confirmed = window.confirm(`Remove "${folderPath}" and all its videos from the library?`)
    if (!confirmed) return
    await window.api.removeFolder(folderPath)
    await fetchFolders()
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold mb-1">Library</h1>
        <p className="text-sm text-muted">Manage the folders MyCinema watches for media files.</p>
      </div>

      {/* Folder List */}
      <div className="space-y-3">
        {folders.length === 0 && (
          <div className="py-12 border-2 border-dashed border-secondary rounded-xl flex flex-col items-center space-y-3 text-muted">
            <HardDrive size={36} className="opacity-40" />
            <p className="text-sm">No folders added yet.</p>
          </div>
        )}

        {folders.map((folder: any) => (
          <div
            key={folder.id}
            className="flex items-center space-x-3 bg-surface border border-secondary rounded-xl px-4 py-3 group"
          >
            <FolderOpen size={18} className="text-primary flex-shrink-0" />
            <span className="flex-1 text-sm font-mono truncate text-text/90" title={folder.path}>
              {folder.path}
            </span>
            {scanning === folder.path && (
              <span className="text-xs text-muted animate-pulse">Scanning…</span>
            )}
            <button
              onClick={() => handleRemoveFolder(folder.path)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10"
              title="Remove folder"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Add Folder Button */}
      <button
        onClick={handleAddFolder}
        disabled={!!scanning}
        className="flex items-center space-x-2 px-5 py-2.5 bg-primary hover:bg-primary/80 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus size={18} />
        <span>{scanning ? 'Scanning…' : 'Add Folder'}</span>
      </button>
    </div>
  )
}

export default Settings
