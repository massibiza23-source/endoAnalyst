/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Activity, 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight,
  Stethoscope,
  Heart,
  Info,
  Loader2,
  ChevronRight,
  Camera,
  X,
  RefreshCw,
  Plus,
  TrendingUp,
  Clock,
  Droplets,
  User,
  Settings,
  ShieldAlert,
  LayoutDashboard,
  Calendar,
  Trash2,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { AnalysisReport, BloodTestResult, UserProfile } from './services/gemini';

interface AnalysisHistoryItem extends AnalysisReport {
  id: string;
  date: string;
}

interface GlucoseLog {
  id: string;
  value: number;
  type: 'Ayunas' | 'Pre-prandial' | 'Post-prandial' | 'Antes de dormir';
  timestamp: Date;
}

export default function App() {
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual Logging State
  const [glucoseLogs, setGlucoseLogs] = useState<GlucoseLog[]>([]);
  const [newLog, setNewLog] = useState({ value: '', type: 'Ayunas' as GlucoseLog['type'] });
  const [activeTab, setActiveTab] = useState<'analysis' | 'logs' | 'history' | 'dashboard' | 'profile'>('analysis');
  const [showSplash, setShowSplash] = useState(true);

  // History State
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisHistoryItem[]>([]);

  // User Profile State
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('endo_profile');
    return saved ? JSON.parse(saved) : {
      conditions: [],
      medications: '',
      otherConditions: ''
    };
  });

  // Load History and Logs on Mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('endo_history');
    if (savedHistory) setAnalysisHistory(JSON.parse(savedHistory));

    const savedLogs = localStorage.getItem('endo_logs');
    if (savedLogs) setGlucoseLogs(JSON.parse(savedLogs));
  }, []);

  // Save to LocalStorage
  useEffect(() => {
    localStorage.setItem('endo_history', JSON.stringify(analysisHistory));
  }, [analysisHistory]);

  useEffect(() => {
    localStorage.setItem('endo_logs', JSON.stringify(glucoseLogs));
  }, [glucoseLogs]);

  useEffect(() => {
    localStorage.setItem('endo_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  const addLog = () => {
    if (!newLog.value) return;
    const log: GlucoseLog = {
      id: Math.random().toString(36).substr(2, 9),
      value: parseFloat(newLog.value),
      type: newLog.type,
      timestamp: new Date()
    };
    setGlucoseLogs([log, ...glucoseLogs]);
    setNewLog({ ...newLog, value: '' });
  };

  const analyzeLogs = async () => {
    if (glucoseLogs.length === 0) return;
    const logText = glucoseLogs.map(l => `${l.timestamp.toLocaleString()}: ${l.value} mg/dL (${l.type})`).join('\n');
    handleAnalysis(`Analiza estos registros manuales de glucosa:\n${logText}`);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraOpen(true);
    } catch (err) {
      console.error(err);
      setError('No se pudo acceder a la cámara. Verifica los permisos.');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        const base64Data = dataUrl.split(',')[1];
        
        stopCamera();
        handleAnalysis({ mimeType: 'image/jpeg', data: base64Data });
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setError('Formato no soportado. Sube una imagen (JPG, PNG) o un PDF.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setReport(null);

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = (reader.result as string).split(',')[1];
      handleAnalysis({ mimeType: file.type, data: base64Data });
    };
    reader.onerror = () => {
      setError('Error al leer el archivo. Intenta de nuevo.');
      setIsAnalyzing(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAnalysis = async (input: string | { mimeType: string; data: string }) => {
    setIsAnalyzing(true);
    setError(null);
    setReport(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, profile, history: analysisHistory })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al procesar el análisis.');
      }

      const result: AnalysisReport = await response.json();
      if (!result || (!result.results && !result.glucoseAnalysis)) {
        throw new Error("No se pudieron extraer resultados válidos.");
      }
      
      const historyItem: AnalysisHistoryItem = {
        ...result,
        id: Math.random().toString(36).substr(2, 9),
        date: result.analysisDate || new Date().toISOString()
      };
      
      const updatedHistory = [historyItem, ...analysisHistory].sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      
      setAnalysisHistory(updatedHistory);
      setReport(result);
      setActiveTab('analysis'); // Switch to results view
    } catch (err) {
      console.error("Analysis Error:", err);
      const message = err instanceof Error ? err.message : 'Error al analizar los resultados. Intenta de nuevo.';
      setError(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeText = () => {
    if (!inputText.trim()) return;
    handleAnalysis(inputText);
  };

  const getAlertColor = (level: string) => {
    switch (level) {
      case 'Normal': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'Seguimiento': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'Revisión médica recomendada': return 'text-rose-600 bg-rose-50 border-rose-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const getInterpretationBadge = (interp: string) => {
    switch (interp) {
      case 'Normal': return 'bg-emerald-100 text-emerald-700';
      case 'Leve': return 'bg-blue-100 text-blue-700';
      case 'Moderado': return 'bg-amber-100 text-amber-700';
      case 'Grave': return 'bg-rose-100 text-rose-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 font-sans selection:bg-blue-100">
      <AnimatePresence>
        {showSplash && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ 
                duration: 0.8,
                ease: [0, 0.71, 0.2, 1.01]
              }}
              className="flex flex-col items-center gap-6"
            >
              <div className="relative">
                <motion.div 
                  animate={{ 
                    scale: [1, 1.1, 1],
                    rotate: [0, 5, -5, 0]
                  }}
                  transition={{ 
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="w-24 h-24 bg-blue-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-200 relative z-10"
                >
                  <Stethoscope className="text-white w-12 h-12" />
                </motion.div>
                <div className="absolute -inset-4 bg-blue-100 rounded-[40px] blur-2xl opacity-50 animate-pulse" />
              </div>
              
              <div className="text-center space-y-2">
                <motion.h1 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-4xl font-black tracking-tighter text-slate-900"
                >
                  Endo<span className="text-blue-600">Analyst</span>
                </motion.h1>
                <motion.p 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-sm font-bold text-slate-400 uppercase tracking-[0.3em]"
                >
                  Asistente Inteligente
                </motion.p>
              </div>

              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: 200 }}
                transition={{ delay: 0.8, duration: 1.2 }}
                className="h-1 bg-slate-100 rounded-full overflow-hidden mt-8"
              >
                <motion.div 
                  animate={{ x: [-200, 200] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  className="w-full h-full bg-blue-600"
                />
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex flex-col gap-4">
            {/* Logo Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                  <Stethoscope className="text-white w-6 h-6" />
                </div>
                <div>
                  <h1 className="font-bold text-lg tracking-tight">EndoAnalyst</h1>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Asistente Endocrino</p>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                MEMORIA ACTIVA
              </div>
            </div>

            {/* Navigation Row (Below Logo) */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar w-full">
              <button 
                onClick={() => setActiveTab('analysis')}
                className={`flex-1 min-w-[80px] px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center justify-center gap-2 ${activeTab === 'analysis' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Activity className="w-3.5 h-3.5" />
                Análisis
              </button>
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`flex-1 min-w-[80px] px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center justify-center gap-2 ${activeTab === 'dashboard' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={`flex-1 min-w-[80px] px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center justify-center gap-2 ${activeTab === 'history' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Clock className="w-3.5 h-3.5" />
                Historial
              </button>
              <button 
                onClick={() => setActiveTab('logs')}
                className={`flex-1 min-w-[80px] px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center justify-center gap-2 ${activeTab === 'logs' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Droplets className="w-3.5 h-3.5" />
                Registros
              </button>
              <button 
                onClick={() => setActiveTab('profile')}
                className={`flex-1 min-w-[80px] px-4 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center justify-center gap-2 ${activeTab === 'profile' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <User className="w-3.5 h-3.5" />
                Perfil
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-[1fr_350px] gap-8">
          {/* Left Column */}
          <div className="space-y-8">
            {activeTab === 'analysis' ? (
              <>
                {/* Input Section */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                          <Activity className="text-blue-600 w-5 h-5" />
                        </div>
                        <h2 className="font-bold text-xl">Analizar Resultados</h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={startCamera}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all flex items-center gap-2 text-xs font-medium"
                          title="Tomar foto"
                        >
                          <Camera className="w-5 h-5" />
                          <span className="hidden sm:inline">Cámara</span>
                        </button>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all flex items-center gap-2 text-xs font-medium"
                          title="Subir archivo"
                        >
                          <Upload className="w-5 h-5" />
                          <span className="hidden sm:inline">Subir PDF/Imagen</span>
                        </button>
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          className="hidden"
                          accept="image/*,application/pdf"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="relative">
                        <textarea
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          placeholder="Pega aquí análisis de sangre o reportes de LibreLink..."
                          className="w-full h-40 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none text-sm leading-relaxed"
                        />
                      </div>

                      <button
                        onClick={handleAnalyzeText}
                        disabled={isAnalyzing || !inputText.trim()}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 group"
                      >
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Analizando parámetros...
                          </>
                        ) : (
                          <>
                            Analizar Texto
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center gap-2 text-xs text-slate-500">
                    <Info className="w-4 h-4" />
                    <span>Soporta reportes de LibreLink (PDF/Fotos) y análisis de sangre.</span>
                  </div>
                </section>

                {/* Results Section */}
                <AnimatePresence>
                  {report && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-8"
                    >
                      {/* Alert Level Banner */}
                      <div className={`p-4 rounded-xl border flex items-center justify-between ${getAlertColor(report.alertLevel)}`}>
                        <div className="flex items-center gap-3">
                          {report.alertLevel === 'Normal' ? <CheckCircle2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider opacity-70">Nivel de Alerta</p>
                            <p className="font-bold text-lg">{report.alertLevel}</p>
                          </div>
                        </div>
                      </div>

                      {/* Glucose Dashboard (Option A) */}
                      {report.glucoseAnalysis && (
                        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                          <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                            <TrendingUp className="text-blue-600 w-5 h-5" />
                            Dashboard de Glucosa (CGM)
                          </h3>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                            <div className="p-4 bg-blue-50 rounded-xl text-center">
                              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">TIR</p>
                              <p className="text-xl font-bold text-blue-700">{report.glucoseAnalysis.timeInRange}</p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-xl text-center">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Promedio</p>
                              <p className="text-xl font-bold text-slate-700">{report.glucoseAnalysis.averageGlucose}</p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-xl text-center">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Variabilidad</p>
                              <p className="text-xl font-bold text-slate-700">{report.glucoseAnalysis.variability}</p>
                            </div>
                            <div className="p-4 bg-emerald-50 rounded-xl text-center">
                              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">HbA1c Est.</p>
                              <p className="text-xl font-bold text-emerald-700">{report.glucoseAnalysis.estimatedHbA1c}</p>
                            </div>
                          </div>

                          {/* Insulin Factors (New) */}
                          {report.glucoseAnalysis.insulinFactors && (
                            <div className="mb-8 p-4 bg-blue-50 rounded-xl border border-blue-100">
                              <h4 className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4" />
                                Orientación sobre Insulina
                              </h4>
                              <div className="space-y-3">
                                <div className="text-sm">
                                  <span className="font-bold text-blue-800">Sensibilidad:</span>
                                  <p className="text-slate-600 mt-1">{report.glucoseAnalysis.insulinFactors.sensitivitySuggestion}</p>
                                </div>
                                <div className="text-sm">
                                  <span className="font-bold text-blue-800">Ratio Carbohidratos:</span>
                                  <p className="text-slate-600 mt-1">{report.glucoseAnalysis.insulinFactors.carbRatioNote}</p>
                                </div>
                                <div className="p-2 bg-amber-100/50 rounded text-[10px] text-amber-800 font-medium">
                                  ⚠️ {report.glucoseAnalysis.insulinFactors.warning}
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="space-y-3">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Patrones Detectados</p>
                            {report.glucoseAnalysis.patterns.map((p, i) => (
                              <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg text-sm">
                                <AlertCircle className="w-4 h-4 text-amber-500" />
                                {p}
                              </div>
                            ))}
                          </div>
                        </section>
                      )}

                      {/* Standard Results Table */}
                      {report.results && report.results.length > 0 && (
                        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                              <FileText className="text-blue-600 w-5 h-5" />
                              Resultados Analizados
                            </h3>
                            <button 
                              onClick={() => setReport(null)}
                              className="text-xs text-slate-400 hover:text-rose-500 font-medium flex items-center gap-1"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Nuevo Análisis
                            </button>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Parámetro</th>
                                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Valor</th>
                                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Referencia</th>
                                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Estado</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {report.results.map((res, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-4">
                                      <p className="font-semibold text-sm">{res.parameter}</p>
                                      <p className="text-[10px] text-slate-400 italic mt-0.5">{res.briefNote}</p>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                      <span className="font-mono font-bold text-slate-700">{res.value}</span>
                                      <span className="text-[10px] text-slate-400 ml-1">{res.unit}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                      <span className="text-xs text-slate-500 font-medium">{res.referenceRange}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getInterpretationBadge(res.interpretation)}`}>
                                        {res.interpretation}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      )}

                      {/* Medical Interpretation */}
                      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                          <Stethoscope className="text-blue-600 w-5 h-5" />
                          Interpretación Médica Global
                        </h3>
                        <div className="prose prose-slate max-w-none">
                          <p className="text-slate-600 leading-relaxed text-sm whitespace-pre-wrap">
                            {report.medicalInterpretation}
                          </p>
                        </div>
                      </section>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            ) : activeTab === 'dashboard' ? (
              /* Dashboard Section (Dynamic Tracking) */
              <div className="space-y-6">
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                        <LayoutDashboard className="text-blue-600 w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="font-bold text-xl">Dashboard Evolutivo</h2>
                        <p className="text-xs text-slate-500">Seguimiento de todos tus parámetros</p>
                      </div>
                    </div>
                  </div>

                  {analysisHistory.length < 2 ? (
                    <div className="p-12 text-center space-y-4 border-2 border-dashed border-slate-100 rounded-2xl">
                      <TrendingUp className="w-12 h-12 text-slate-200 mx-auto" />
                      <p className="text-sm text-slate-500 max-w-xs mx-auto">
                        Necesitas al menos 2 análisis en tu historial para generar gráficos de evolución.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-10">
                      {/* Dynamic Parameter Charts */}
                      {Array.from(new Set(analysisHistory.flatMap(h => h.results.map(r => r.parameter)))).map((param) => {
                        const chartData = [...analysisHistory]
                          .reverse()
                          .map(h => {
                            const result = h.results.find(r => r.parameter === param);
                            if (!result) return null;
                            const numValue = parseFloat(result.value.replace(/[^0-9.]/g, ''));
                            return isNaN(numValue) ? null : {
                              date: new Date(h.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' }),
                              fullDate: new Date(h.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
                              value: numValue,
                              unit: result.unit
                            };
                          })
                          .filter(d => d !== null);

                        if (chartData.length < 2) return null;

                        return (
                          <div key={param} className="space-y-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                {param}
                                <span className="text-[10px] text-slate-400 font-normal ml-1">({chartData[0]?.unit})</span>
                              </h3>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  chartData[chartData.length-1]!.value > chartData[chartData.length-2]!.value 
                                    ? 'bg-rose-50 text-rose-600' 
                                    : 'bg-emerald-50 text-emerald-600'
                                }`}>
                                  {chartData[chartData.length-1]!.value > chartData[chartData.length-2]!.value ? '↑' : '↓'} 
                                  {Math.abs(chartData[chartData.length-1]!.value - chartData[chartData.length-2]!.value).toFixed(1)}
                                </span>
                              </div>
                            </div>
                            <div className="h-48 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                  <defs>
                                    <linearGradient id={`color-${param}`} x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                  <XAxis 
                                    dataKey="date" 
                                    fontSize={9} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    tick={{ fill: '#94A3B8' }}
                                  />
                                  <YAxis 
                                    fontSize={9} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    tick={{ fill: '#94A3B8' }}
                                    domain={['auto', 'auto']}
                                  />
                                  <Tooltip 
                                    contentStyle={{ 
                                      borderRadius: '12px', 
                                      border: 'none', 
                                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                      fontSize: '12px',
                                      fontWeight: '600'
                                    }}
                                    labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                                    labelFormatter={(label, payload) => payload[0]?.payload?.fullDate || label}
                                  />
                                  <Area 
                                    type="monotone" 
                                    dataKey="value" 
                                    stroke="#3B82F6" 
                                    fillOpacity={1} 
                                    fill={`url(#color-${param})`} 
                                    strokeWidth={3}
                                    animationDuration={1500}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            ) : activeTab === 'history' ? (
              /* History Section (New) */
              <div className="space-y-6">
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                        <Clock className="text-blue-600 w-6 h-6" />
                      </div>
                      <h2 className="font-bold text-xl">Historial de Análisis</h2>
                    </div>
                    <button 
                      onClick={() => { if(confirm('¿Borrar todo el historial?')) setAnalysisHistory([]); }}
                      className="text-xs text-rose-500 font-bold hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-all"
                    >
                      Limpiar Todo
                    </button>
                  </div>
                  
                  <div className="divide-y divide-slate-100">
                    {analysisHistory.length > 0 ? (
                      analysisHistory.map((item) => (
                        <div key={item.id} className="p-6 hover:bg-slate-50 transition-all group">
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                                <Calendar className="w-6 h-6 text-slate-400" />
                              </div>
                              <div>
                                <p className="font-bold text-slate-900">
                                  {new Date(item.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                                <div className="flex flex-col gap-1 mt-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getAlertColor(item.alertLevel)}`}>
                                      {item.alertLevel}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                      {item.results.length} parámetros
                                    </span>
                                  </div>
                                  {(item.doctorName || item.clinicName) && (
                                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                      <Stethoscope className="w-3 h-3 text-blue-400" />
                                      <span className="font-medium">
                                        {item.doctorName && `Dr. ${item.doctorName}`}
                                        {item.doctorName && item.clinicName && ' • '}
                                        {item.clinicName}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => { setReport(item); setActiveTab('analysis'); }}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                title="Ver detalles"
                              >
                                <FileText className="w-5 h-5" />
                              </button>
                              <button 
                                onClick={() => setAnalysisHistory(analysisHistory.filter(h => h.id !== item.id))}
                                className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                title="Eliminar"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                            {item.results.slice(0, 4).map((r, i) => (
                              <div key={i} className="px-3 py-1.5 bg-white border border-slate-100 rounded-lg text-[10px] whitespace-nowrap">
                                <span className="text-slate-400 mr-1">{r.parameter}:</span>
                                <span className="font-bold text-slate-700">{r.value}</span>
                              </div>
                            ))}
                            {item.results.length > 4 && (
                              <div className="px-3 py-1.5 bg-slate-100 rounded-lg text-[10px] text-slate-500 font-bold">
                                +{item.results.length - 4}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-20 text-center space-y-4">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                          <Clock className="w-8 h-8 text-slate-200" />
                        </div>
                        <p className="text-slate-400 text-sm">No hay análisis guardados en el historial.</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : activeTab === 'logs' ? (
              /* Manual Logging Section (Option B) */
              <div className="space-y-6">
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Plus className="text-blue-600 w-5 h-5" />
                    Nuevo Registro de Glucosa
                  </h3>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="relative">
                      <input
                        type="number"
                        value={newLog.value}
                        onChange={(e) => setNewLog({ ...newLog, value: e.target.value })}
                        placeholder="Valor (mg/dL)"
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                      />
                      <Droplets className="absolute right-3 top-3 w-4 h-4 text-rose-400" />
                    </div>
                    <select
                      value={newLog.type}
                      onChange={(e) => setNewLog({ ...newLog, type: e.target.value as any })}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                    >
                      <option>Ayunas</option>
                      <option>Pre-prandial</option>
                      <option>Post-prandial</option>
                      <option>Antes de dormir</option>
                    </select>
                    <button
                      onClick={addLog}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      Añadir
                    </button>
                  </div>
                </section>

                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <Clock className="text-blue-600 w-5 h-5" />
                      Historial Reciente
                    </h3>
                    <button 
                      onClick={analyzeLogs}
                      disabled={glucoseLogs.length === 0 || isAnalyzing}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 disabled:opacity-50"
                    >
                      {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <TrendingUp className="w-3 h-3" />}
                      Analizar Tendencias
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {glucoseLogs.length > 0 ? (
                      glucoseLogs.map((log) => (
                        <div key={log.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${log.value > 140 ? 'bg-rose-50 text-rose-600' : log.value < 70 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                              {log.value}
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{log.type}</p>
                              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                <Clock className="w-3 h-3" />
                                {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                          <button 
                            onClick={() => setGlucoseLogs(glucoseLogs.filter(l => l.id !== log.id))}
                            className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="p-12 text-center space-y-2">
                        <Droplets className="w-8 h-8 text-slate-200 mx-auto" />
                        <p className="text-sm text-slate-400">No hay registros aún.</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              /* Profile Section (New) */
              <div className="space-y-6">
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <User className="text-blue-600 w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="font-bold text-xl">Perfil del Paciente</h2>
                      <p className="text-xs text-slate-500">Personaliza el análisis según tu condición médica</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Condiciones Principales</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          'Diabetes Tipo 1', 
                          'Diabetes Tipo 2', 
                          'Bariátrica Parcial', 
                          'Bariátrica Total', 
                          'Osteoporosis', 
                          'Hipertensión',
                          'Hipotiroidismo',
                          'Hipertiroidismo'
                        ].map((cond) => (
                          <label key={cond} className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                            profile.conditions.includes(cond) 
                              ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' 
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-200'
                          }`}>
                            <input
                              type="checkbox"
                              checked={profile.conditions.includes(cond)}
                              onChange={(e) => {
                                const newConditions = e.target.checked 
                                  ? [...profile.conditions, cond]
                                  : profile.conditions.filter(c => c !== cond);
                                setProfile({ ...profile, conditions: newConditions });
                              }}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium">{cond}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Otras Enfermedades / Detalles</label>
                      <input
                        type="text"
                        value={profile.otherConditions}
                        onChange={(e) => setProfile({ ...profile, otherConditions: e.target.value })}
                        placeholder="Ej: Hipertensión, Hipotiroidismo..."
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Medicación Actual</label>
                      <textarea
                        value={profile.medications}
                        onChange={(e) => setProfile({ ...profile, medications: e.target.value })}
                        placeholder="Ej: Metformina 850mg, Insulina Glargina..."
                        className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm resize-none"
                      />
                    </div>

                    <div className="p-4 bg-blue-50 rounded-xl flex items-start gap-3">
                      <Settings className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-800 leading-relaxed">
                        Configurar tu perfil ayuda a la IA a priorizar parámetros específicos (como micronutrientes en pacientes bariátricos) y a contextualizar tus niveles de glucosa.
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>

          {/* Right Column: Recommendations & Missing Data */}
          <aside className="space-y-6">
            <AnimatePresence>
              {report ? (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-6"
                >
                  {/* Recommendations */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Heart className="text-rose-500 w-5 h-5" />
                      Recomendaciones
                    </h4>
                    
                    <div className="space-y-6">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Hábitos</p>
                        <ul className="space-y-2">
                          {report.recommendations.habits.map((h, i) => (
                            <li key={i} className="text-xs text-slate-600 flex gap-2">
                              <ChevronRight className="w-3 h-3 shrink-0 text-blue-500 mt-0.5" />
                              {h}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Suplementos (Orientativo)</p>
                        <ul className="space-y-2">
                          {report.recommendations.supplements.map((s, i) => (
                            <li key={i} className="text-xs text-slate-600 flex gap-2">
                              <ChevronRight className="w-3 h-3 shrink-0 text-blue-500 mt-0.5" />
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="pt-4 border-t border-slate-100">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Especialista</p>
                        <p className="text-xs font-semibold text-blue-700 bg-blue-50 p-3 rounded-lg">
                          {report.recommendations.specialist}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Missing Data */}
                  {report.missingData.length > 0 && (
                    <div className="bg-slate-900 rounded-2xl p-6 text-white">
                      <h4 className="font-bold mb-4 flex items-center gap-2 text-blue-400">
                        <AlertCircle className="w-5 h-5" />
                        Datos Faltantes
                      </h4>
                      <p className="text-xs text-slate-400 mb-4">Para un perfil endocrino más completo, se sugiere incluir:</p>
                      <ul className="space-y-2">
                        {report.missingData.map((m, i) => (
                          <li key={i} className="text-xs flex items-center gap-2">
                            <div className="w-1 h-1 bg-blue-400 rounded-full" />
                            {m}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 border-dashed p-8 text-center space-y-4">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                    <FileText className="text-slate-300 w-6 h-6" />
                  </div>
                  <p className="text-sm text-slate-500">Sube tus resultados o usa la cámara para ver recomendaciones personalizadas.</p>
                </div>
              )}
            </AnimatePresence>

            {/* Disclaimer */}
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
              <p className="text-[10px] text-amber-800 leading-relaxed italic">
                “Este análisis es orientativo y no sustituye la valoración médica presencial. Siempre consulta con un profesional de la salud antes de tomar decisiones médicas.”
              </p>
            </div>
          </aside>
        </div>
      </main>

      {/* Camera Modal */}
      <AnimatePresence>
        {isCameraOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4"
          >
            <div className="relative w-full max-w-2xl bg-slate-900 rounded-3xl overflow-hidden shadow-2xl">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-auto aspect-video object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              
              <div className="absolute top-4 right-4">
                <button 
                  onClick={stopCamera}
                  className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="absolute bottom-8 left-0 right-0 flex justify-center items-center gap-8">
                <button
                  onClick={capturePhoto}
                  className="w-16 h-16 bg-white rounded-full border-4 border-slate-400 flex items-center justify-center shadow-xl active:scale-95 transition-all"
                >
                  <div className="w-12 h-12 bg-white rounded-full border-2 border-slate-900" />
                </button>
              </div>
            </div>
            <p className="text-white/60 text-sm mt-6 font-medium">Alinea tus resultados dentro del cuadro</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 text-sm shadow-xl"
          >
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-2">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-4 py-12 border-t border-slate-200 text-center">
        <p className="text-xs text-slate-400">© 2026 EndoAnalyst. Desarrollado con tecnología de IA para asistencia clínica.</p>
      </footer>
    </div>
  );
}
