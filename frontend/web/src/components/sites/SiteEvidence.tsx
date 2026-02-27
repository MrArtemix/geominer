'use client';

/* ============================================
   SiteEvidence - Grille thumbnails preuves
   avec lightbox, hash SHA-256, IPFS, blockchain
   + drag & drop upload
   ============================================ */

import { useState, useCallback, useRef } from 'react';
import {
  FileImage,
  FileText,
  FileVideo,
  File,
  Download,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Copy,
  Check,
  ExternalLink,
  Link2,
  X,
  Upload,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Fingerprint,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/cn';
import api from '@/lib/api';

/* ---------- types ---------- */

export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface Evidence {
  id: string;
  site_id: string;
  filename: string;
  file_type: string;
  file_url: string;
  thumbnail_url?: string;
  sha256_hash: string;
  cid_ipfs?: string;
  ipfs_gateway_url?: string;
  blockchain_tx_id?: string;
  uploaded_at: string;
  uploaded_by: string;
  verification_status: VerificationStatus;
}

/* ---------- helpers ---------- */

function fileIcon(type: string) {
  if (type.startsWith('image')) return FileImage;
  if (type.startsWith('video')) return FileVideo;
  if (type.includes('pdf') || type.startsWith('text')) return FileText;
  return File;
}

function isImage(type: string) {
  return type.startsWith('image');
}

const VERIFICATION_BADGE: Record<
  VerificationStatus,
  { label: string; cls: string; icon: typeof ShieldCheck }
> = {
  VERIFIED: {
    label: 'Verifie',
    cls: 'badge-success',
    icon: ShieldCheck,
  },
  PENDING: {
    label: 'En attente',
    cls: 'badge-high',
    icon: Clock,
  },
  REJECTED: {
    label: 'Rejete',
    cls: 'badge-critical',
    icon: ShieldAlert,
  },
};

/* ---------- props ---------- */

interface SiteEvidenceProps {
  evidence: Evidence[];
  siteId: string;
  className?: string;
  /** Callback pour rafraichir les preuves apres upload */
  onUploadComplete?: () => void;
}

/* ---------- composant CopyButton ---------- */

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* fallback silencieux */
      }
    },
    [text],
  );

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-[10px] text-geo-600 hover:text-gold-400 transition-colors"
      title={`Copier ${label || ''}`}
    >
      {copied ? <Check size={10} className="text-gold-400" /> : <Copy size={10} />}
      {copied ? 'Copie !' : 'Copier'}
    </button>
  );
}

/* ---------- composant Lightbox ---------- */

function Lightbox({
  evidence,
  currentIndex,
  onClose,
  onPrev,
  onNext,
}: {
  evidence: Evidence[];
  currentIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const current = evidence[currentIndex];
  if (!current) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.85)' }}
        onClick={onClose}
      >
        {/* Bouton fermer */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <X size={20} />
        </button>

        {/* Navigation */}
        {evidence.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onPrev(); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onNext(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}

        {/* Image principale */}
        <motion.div
          key={current.id}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="relative max-w-4xl max-h-[80vh] mx-16"
          onClick={(e) => e.stopPropagation()}
        >
          {isImage(current.file_type) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.file_url}
              alt={current.filename}
              className="max-w-full max-h-[70vh] object-contain rounded-xl"
              style={{ boxShadow: '0 0 60px rgba(0,0,0,0.5)' }}
            />
          ) : (
            <div className="w-96 h-64 flex flex-col items-center justify-center rounded-xl bg-geo-900 border border-white/[0.1]">
              {(() => { const FIcon = fileIcon(current.file_type); return <FIcon size={48} className="text-geo-600 mb-3" />; })()}
              <p className="text-sm text-geo-400 font-medium">{current.filename}</p>
              <a
                href={current.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 btn-primary text-xs flex items-center gap-1"
              >
                <Download size={14} />
                Telecharger
              </a>
            </div>
          )}

          {/* Info bas lightbox */}
          <div
            className="mt-3 rounded-xl px-4 py-3"
            style={{
              background: 'rgba(15, 23, 42, 0.9)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(148, 163, 184, 0.1)',
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-geo-400 font-medium">{current.filename}</p>
                <p className="text-xs text-geo-600 mt-0.5">
                  {new Date(current.uploaded_at).toLocaleDateString('fr-FR')} - {current.uploaded_by}
                </p>
              </div>
              <div className="text-xs text-geo-600 mono">
                {currentIndex + 1} / {evidence.length}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ---------- composant Drag & Drop Zone ---------- */

function DropZone({
  siteId,
  onComplete,
}: {
  siteId: string;
  onComplete?: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      setUploading(true);
      setUploadProgress(0);

      try {
        for (let i = 0; i < fileArray.length; i++) {
          const formData = new FormData();
          formData.append('file', fileArray[i]);
          formData.append('site_id', siteId);

          await api.post('/api/v1/evidence', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (event) => {
              const pct = event.total
                ? Math.round(((i + (event.loaded / event.total)) / fileArray.length) * 100)
                : 0;
              setUploadProgress(pct);
            },
          });
        }

        onComplete?.();
      } catch {
        /* Erreur silencieuse en mode demo */
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [siteId, onComplete],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={cn(
        'relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-300',
        isDragging
          ? 'border-gold-400 bg-gold-500/[0.05]'
          : 'border-geo-700 hover:border-geo-600 hover:bg-white/[0.01]',
        uploading && 'pointer-events-none',
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {uploading ? (
        <div className="space-y-3">
          <div className="w-full h-2 rounded-full overflow-hidden bg-geo-800">
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #fbbf24, #f59e0b)' }}
              initial={{ width: '0%' }}
              animate={{ width: `${uploadProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <p className="text-xs text-geo-500">
            Telechargement en cours... {uploadProgress}%
          </p>
        </div>
      ) : (
        <>
          <Upload
            className={cn(
              'mx-auto mb-2 transition-colors',
              isDragging ? 'text-gold-400' : 'text-geo-600',
            )}
            size={28}
          />
          <p className="text-sm text-geo-500">
            Glissez-deposez ou cliquez pour ajouter des preuves
          </p>
          <p className="text-xs text-geo-700 mt-1">
            Images satellite, photos terrain, PDF, documents
          </p>
        </>
      )}
    </div>
  );
}

/* ---------- composant principal ---------- */

export default function SiteEvidence({
  evidence,
  siteId,
  className,
  onUploadComplete,
}: SiteEvidenceProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openLightbox = useCallback((idx: number) => {
    setLightboxIndex(idx);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const prevImage = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev - 1 + evidence.length) % evidence.length : null,
    );
  }, [evidence.length]);

  const nextImage = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev + 1) % evidence.length : null,
    );
  }, [evidence.length]);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Grille thumbnails */}
      {evidence.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <FileImage size={28} className="text-geo-700" />
          <p className="text-sm text-geo-600 text-center">
            Aucune preuve enregistree pour ce site.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {evidence.map((ev, idx) => {
            const Icon = fileIcon(ev.file_type);
            const badge = VERIFICATION_BADGE[ev.verification_status];
            const BadgeIcon = badge.icon;
            const hasBlockchain = !!ev.blockchain_tx_id;
            const hasIPFS = !!ev.cid_ipfs;

            return (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="glass-card-hover !p-0 overflow-hidden flex flex-col"
              >
                {/* Thumbnail clickable */}
                <div
                  onClick={() => openLightbox(idx)}
                  className="relative group cursor-pointer"
                >
                  {isImage(ev.file_type) ? (
                    <div className="h-32 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={ev.thumbnail_url || ev.file_url}
                        alt={ev.filename}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      {/* Overlay au hover */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <ZoomIn size={24} className="text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="h-32 flex items-center justify-center bg-geo-900/40">
                      <Icon size={36} className="text-geo-600" />
                    </div>
                  )}

                  {/* Badge blockchain */}
                  {hasBlockchain && (
                    <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold text-gold-400 bg-gold-500/20 border border-gold-500/30">
                      <Fingerprint size={9} />
                      Blockchain
                    </span>
                  )}
                </div>

                {/* Info section */}
                <div className="p-3 flex flex-col gap-2 flex-1">
                  {/* Nom + date */}
                  <div className="flex items-start gap-2">
                    <div className="p-1.5 rounded-lg shrink-0 bg-white/[0.04]">
                      <Icon size={14} className="text-geo-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-geo-400 truncate">
                        {ev.filename}
                      </p>
                      <p className="text-[10px] text-geo-600 mt-0.5">
                        {new Date(ev.uploaded_at).toLocaleDateString('fr-FR')} - {ev.uploaded_by}
                      </p>
                    </div>
                  </div>

                  {/* SHA-256 */}
                  <div className="flex items-center gap-1.5">
                    <div
                      className="flex-1 text-[10px] mono text-geo-700 truncate px-2 py-1 rounded"
                      style={{ background: 'rgba(15,23,42,0.4)' }}
                      title={ev.sha256_hash}
                    >
                      SHA-256: {ev.sha256_hash.slice(0, 16)}...
                    </div>
                    <CopyButton text={ev.sha256_hash} label="SHA-256" />
                  </div>

                  {/* CID IPFS */}
                  {hasIPFS && (
                    <div className="flex items-center gap-1.5">
                      <div
                        className="flex-1 text-[10px] mono text-geo-700 truncate px-2 py-1 rounded"
                        style={{ background: 'rgba(15,23,42,0.4)' }}
                        title={ev.cid_ipfs}
                      >
                        CID: {ev.cid_ipfs?.slice(0, 20)}...
                      </div>
                      <CopyButton text={ev.cid_ipfs || ''} label="CID IPFS" />
                      {ev.ipfs_gateway_url && (
                        <a
                          href={ev.ipfs_gateway_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
                          title="Ouvrir sur IPFS Gateway"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Verification + Download */}
                  <div className="flex items-center justify-between mt-auto pt-1">
                    <span className={cn('inline-flex items-center gap-1', badge.cls)}>
                      <BadgeIcon size={10} />
                      {badge.label}
                    </span>

                    <a
                      href={ev.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gold-400 hover:text-gold-300 transition-colors p-1"
                      title="Telecharger"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download size={14} />
                    </a>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Zone drag & drop upload */}
      <DropZone siteId={siteId} onComplete={onUploadComplete} />

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          evidence={evidence}
          currentIndex={lightboxIndex}
          onClose={closeLightbox}
          onPrev={prevImage}
          onNext={nextImage}
        />
      )}
    </div>
  );
}
