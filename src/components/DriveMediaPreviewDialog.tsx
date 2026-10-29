import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { getCollabDriveFileBlob } from '@/lib/chat-client';
import './DriveMediaPreviewDialog.css';

interface DriveMediaPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  mimeType: string;
  fileId?: string;
  roomId?: string;
  sourceUrl?: string | null;
}

export default function DriveMediaPreviewDialog({
  open,
  onOpenChange,
  fileName,
  mimeType,
  fileId,
  roomId,
  sourceUrl,
}: DriveMediaPreviewDialogProps) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setLoadedUrl(null);
      setLoading(false);
      setError(null);
      return undefined;
    }
    if (sourceUrl) {
      setLoadedUrl(null);
      setLoading(false);
      setError(null);
      return undefined;
    }
    if (!fileId) {
      setError('This file cannot be previewed.');
      setLoading(false);
      return undefined;
    }

    let active = true;
    let objectUrl: string | null = null;
    setLoadedUrl(null);
    setLoading(true);
    setError(null);
    void getCollabDriveFileBlob(fileId, roomId)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setLoadedUrl(objectUrl);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load this file.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, open, roomId, sourceUrl]);

  const src = sourceUrl ?? loadedUrl;
  const isPdf = mimeType.toLowerCase() === 'application/pdf' || /\.pdf$/i.test(fileName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="drive-media-preview-dialog !fixed !inset-0 !left-0 !top-0 !z-[140] !h-[100dvh] !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 !gap-0 !rounded-none !border-0 !p-0"
      >
        <header className="drive-media-preview-header">
          <div>
            <DialogTitle title={fileName}>{fileName}</DialogTitle>
            <DialogDescription>{mimeType || 'File preview'}</DialogDescription>
          </div>
          <button type="button" aria-label="Close preview" onClick={() => onOpenChange(false)}>
            <X className="size-5" />
          </button>
        </header>
        <div className="drive-media-preview-body" aria-busy={loading}>
          {loading && <p>Loading preview…</p>}
          {error && <p role="alert">{error}</p>}
          {!loading && !error && src && (
            isPdf
              ? <iframe src={src} title={fileName} />
              : mimeType.startsWith('image/')
                ? <img src={src} alt={fileName} />
                : mimeType.startsWith('video/')
                  ? <video src={src} controls playsInline />
                  : mimeType.startsWith('audio/')
                    ? <audio src={src} controls />
                    : <p>This file type is not supported for preview.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
