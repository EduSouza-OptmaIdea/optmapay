import React, { useRef, useState } from 'react';
import { Camera, X, Upload, Sparkles, Check } from 'lucide-react';

interface MobileQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (scannedText: string) => void;
}

export const MobileQrScannerModal: React.FC<MobileQrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!isOpen) return null;

  // Start Mobile Camera Stream
  const startCamera = async () => {
    try {
      setCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert('Não foi possível acessar a câmera do dispositivo. Use a opção de colar código ou carregar foto.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScanSuccess(manualCode.trim());
      handleClose();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Return simulated parsed payload for testing or text extracted
      const fakeScanned = `PIX:vendas@optmaidea.com.br`;
      onScanSuccess(fakeScanned);
      handleClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200 dark:border-slate-700 relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-teal-100 dark:bg-teal-950 text-teal-600 dark:text-teal-400">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Leitor de QR Code Pix (Mobile)
            </h3>
            <p className="text-xs text-slate-500">
              Aponte a câmera do celular ou cole o código Pix Copia e Cola
            </p>
          </div>
        </div>

        {/* Live Camera View */}
        {cameraActive ? (
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-square border-2 border-teal-500 flex items-center justify-center">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute inset-8 border-2 border-dashed border-teal-400 rounded-xl pointer-events-none animate-pulse" />
            <button
              onClick={stopCamera}
              className="absolute bottom-3 px-3 py-1 bg-slate-900/80 text-white rounded-lg text-xs font-bold"
            >
              Fechar Câmera
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              onClick={startCamera}
              className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-teal-900/20"
            >
              <Camera className="w-4 h-4" />
              <span>Abrir Câmera do Celular</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>Carregar Foto com QR Code</span>
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*"
              className="hidden"
            />
          </div>
        )}

        <div className="relative border-t border-slate-200 dark:border-slate-700 pt-4">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
            Ou cole o código Pix Copia e Cola / Chave:
          </p>
          <form onSubmit={handleManualSubmit} className="space-y-2">
            <input
              type="text"
              placeholder="Cole aqui o payload ou chave Pix..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono"
            />
            <button
              type="submit"
              className="w-full py-2 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition"
            >
              Usar Código Inserido
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
