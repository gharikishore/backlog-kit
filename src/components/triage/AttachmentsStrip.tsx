"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";

// Intake #197: image attachments on backlog cards. Self-contained;
// owns its own fetches against /api/admin/backlog/[id]/attachments.
//
// Display:
//   - Hidden entirely when no attachments AND not in edit mode.
//   - Otherwise: small "Attachments" header + a thumbnail row. Each
//     thumbnail clicks through to a new tab (data URL) for full-size
//     view. In edit mode, each thumb also gets an X to remove.
//   - In edit mode an "+ Upload image" button triggers a hidden
//     <input type="file" accept="image/*">.

type Attachment = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl?: string;  // GET returns the full data URL; POST response omits it
  caption: string | null;
  createdAt: string;
};

const ALLOWED_MIMES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export function AttachmentsStrip({ itemId, canEdit }: { itemId: string; canEdit: boolean }) {
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/backlog/${itemId}/attachments`, { cache: "no-store" });
      const data = await r.json();
      if (r.ok) setItems((data.items ?? []) as Attachment[]);
    } catch {
      // Silent — degrades to "no attachments" until next refetch.
    }
  }, [itemId]);

  useEffect(() => { void reload(); }, [reload]);

  async function onFileSelected(file: File) {
    setError(null);
    if (!ALLOWED_MIMES.includes(file.type)) {
      setError("Image only (PNG, JPEG, GIF, WebP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Max 5 MB per image.");
      return;
    }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      const r = await fetch(`/api/admin/backlog/${itemId}/attachments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, mimeType: file.type, dataUrl }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error ?? `Upload failed (${r.status})`);
        return;
      }
      await reload();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function remove(attachmentId: string) {
    setUploading(true);
    try {
      await fetch(`/api/admin/backlog/${itemId}/attachments?attachmentId=${attachmentId}`, { method: "DELETE" });
      await reload();
    } finally {
      setUploading(false);
    }
  }

  if (items === null) return null;
  if (items.length === 0 && !canEdit) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.15em] opacity-55 mb-2">
        <Paperclip size={11} />
        Attachments
        {items.length > 0 && (
          <span className="normal-case tracking-normal opacity-75">({items.length})</span>
        )}
      </div>
      {items.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {items.map((a) => (
            <div
              key={a.id}
              className="relative group rounded border overflow-hidden"
              style={{ borderColor: "rgba(26,24,20,0.15)", backgroundColor: "white", width: 96, height: 96 }}
            >
              {a.dataUrl && (
                <a
                  href={a.dataUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${a.filename} (${formatBytes(a.sizeBytes)})`}
                  className="block w-full h-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.dataUrl}
                    alt={a.filename}
                    className="w-full h-full object-cover"
                  />
                </a>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  disabled={uploading}
                  className="absolute top-1 right-1 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: "rgba(255,255,255,0.9)", color: "#7a1f1f" }}
                  title="Remove attachment"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFileSelected(f);
            }}
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="font-mono text-[11px] uppercase tracking-[0.15em] opacity-60 hover:opacity-100"
          >
            {uploading ? "Uploading…" : "+ Upload image"}
          </button>
          {error && (
            <span className="font-mono text-[10px] normal-case tracking-normal" style={{ color: "#7a1f1f" }}>
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
