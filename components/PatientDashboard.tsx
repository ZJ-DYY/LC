import React, { useState, useMemo, useEffect } from 'react';
import { PatientProfile, ReportData, StructuredAdvice, TreatmentPlan, SymptomEntry, HADSResult, UKBLifestyleProfile } from '../types';
import BodyMap from './BodyMap';
import SmartUpload from './SmartUpload';
import WeeklyInsights from './WeeklyInsights';
import { SYMPTOM_OPTIONS, generateSmartAdvice, getSideEffectsForTreatment, HADS_QUESTIONS, calculateHADSLevel, CTCAE_STANDARDS, TERM_MAPPING, GENERIC_GRADES } from '../services/knowledgeBase';
import { Heart, Activity, Thermometer, Smile, AlertCircle, Sparkles, Plus, FileText, ChevronRight, ArrowLeft, TrendingUp, CheckCircle, BrainCircuit, Pill, ShieldCheck, Zap, Info, CalendarCheck, HeartPulse, Stethoscope, Utensils, Clock, Sun, Moon, Quote, Gauge, X, PauseCircle, ArrowUp, ArrowDown, ClipboardCheck, Siren, Leaf, Coffee, Scale, PieChart, ArrowRight, Fingerprint, Cigarette, Wind, Apple, Loader2, Edit2, Check, Battery, BedDouble, PersonStanding, Star, Move, Fish } from 'lucide-react';
import { clsx } from 'clsx';
import { PatientSubSection } from '../App';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceArea, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { generateLifestyleReport } from '../services/geminiService';

interface PatientDashboardProps {
  patient: PatientProfile;
  onUpdatePatient: (updated: PatientProfile) => void;
  activeSection: PatientSubSection;
  onChangeSection: (section: PatientSubSection) => void;
}

// 扩展后的指标字典
const METRIC_DICT: Record<string, string> = {
  'WBC': '白细胞 (WBC)',
  'Hemoglobin': '血红蛋白 (Hb)',
  'Platelet': '血小板 (PLT)',
  'Neutrophil': '中性粒细胞 (NEU)',
  'Lymphocyte': '淋巴细胞 (LYM)',
  'RBC': '红细胞 (RBC)',
  'ALT': '谷丙转氨酶 (ALT)',
  'AST': '谷草转氨酶 (AST)',
  'Creatinine': '肌酐 (Cr)',
  'CEA': '癌胚抗原 (CEA)'
};

// 完善的参考值范围 (单位仅供展示参考)
const REF_RANGES: Record<string, { min: number, max: number, unit: string }> = {
  'WBC': { min: 3.5, max: 9.5, unit: '10^9/L' },
  'Hemoglobin': { min: 115, max: 150, unit: 'g/L' }, // 以女性标准为例，男性一般130-175
  'Platelet': { min: 125, max: 350, unit: '10^9/L' },
  'Neutrophil': { min: 1.8, max: 6.3, unit: '10^9/L' },
  'Lymphocyte': { min: 1.1, max: 3.2, unit: '10^9/L' },
  'RBC': { min: 3.8, max: 5.1, unit: '10^12/L' },
  'ALT': { min: 7, max: 40, unit: 'U/L' },
  'AST': { min: 13, max: 35, unit: 'U/L' },
  'Creatinine': { min: 44, max: 97, unit: 'μmol/L' },
  'CEA': { min: 0, max: 5, unit: 'ng/mL' }
};

const CHART_COLORS = ['#4f46e5', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#6366f1', '#a855f7'];

const DURATION_OPTIONS = ['< 1小时', '1-4 小时', '半天', '全天', '持续多日'];

const DAILY_QUOTES = [
    "世界上只有一种英雄主义，就是在认清生活真相之后依然热爱生活。——罗曼·罗兰",
    "每一个不曾起舞的日子，都是对生命的辜负。——尼采",
    "希望能像阳光一样，不偏不倚地洒在每个人身上。",
    "在此刻的身体里，安住下来。",
    "通过裂缝，光才能照进来。"
];

const PatientDashboard: React.FC<PatientDashboardProps> = ({ patient, onUpdatePatient, activeSection, onChangeSection }) => {
  // --- MEDICAL RECORD STATE ---
  const [recordMode, setRecordMode] = useState<'LIST' | 'DETAIL' | 'UPLOAD'>('LIST');
  const [recordTab, setRecordTab] = useState<'LAB' | 'CT'>('LAB');
  const [selectedReport, setSelectedReport] = useState<ReportData | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['WBC', 'Hemoglobin']); 

  // --- CHECK-IN WIZARD STATE ---
  const [isCheckedInToday, setIsCheckedInToday] = useState(false);
  const [checkInStep, setCheckInStep] = useState<'INTRO' | 'VITALS' | 'MEDS' | 'DT' | 'HADS' | 'SYMPTOMS' | 'RESULT'>('INTRO');
  
  // Vitals
  const [weight, setWeight] = useState<number>(patient.weight || 60);
  const [temp, setTemp] = useState<number>(36.5);
  
  // Medication Adherence
  const [medicationStatus, setMedicationStatus] = useState<'Taken' | 'Skipped' | 'Not Required'>('Taken');

  // DT (Distress Thermometer)
  const [dtScore, setDtScore] = useState<number>(0);

  // HADS
  const [hadsAnswers, setHadsAnswers] = useState<Record<number, number>>({});
  const [currentHadsQuestion, setCurrentHadsQuestion] = useState(0);

  // Symptoms
  const [symptomLog, setSymptomLog] = useState<SymptomEntry[]>([]);
  const [adviceList, setAdviceList] = useState<StructuredAdvice[]>([]);
  
  // Modal/Selection State
  const [activeBodyPart, setActiveBodyPart] = useState<string | null>(null);
  const [modalSymptoms, setModalSymptoms] = useState<string[]>([]);
  const [selectedSymptom, setSelectedSymptom] = useState<string | null>(null);
  const [customSymptomText, setCustomSymptomText] = useState('');
  const [symptomSeverity, setSymptomSeverity] = useState<number>(1);
  const [symptomDuration, setSymptomDuration] = useState<string>('半天');
  const [dailyQuote, setDailyQuote] = useState('');
  
  // Weekly Report Modal State
  const [showWeeklyReport, setShowWeeklyReport] = useState(false);
  
  // UKB AI Loading State
  const [isGeneratingUKB, setIsGeneratingUKB] = useState(false);
  const [ukbAdvice, setUkbAdvice] = useState<string | null>(null);
  
  // UKB Edit Modal State
  const [showUKBEditModal, setShowUKBEditModal] = useState(false);
  // Temporary state for editing
  const [editingUKB, setEditingUKB] = useState<UKBLifestyleProfile | undefined>(patient.ukbProfile);

  // Predicted Side Effects for Quick Select
  const likelySideEffects = useMemo(() => getSideEffectsForTreatment(patient.currentTreatment), [patient.currentTreatment]);

  // Helper to get current severity description
  const getCurrentGradeDescription = useMemo(() => {
    const finalSymptomName = selectedSymptom === 'OTHER' ? customSymptomText : selectedSymptom;
    if (!finalSymptomName) return "";

    const mappedName = TERM_MAPPING[finalSymptomName] || finalSymptomName;
    const standard = CTCAE_STANDARDS[mappedName];
    
    // Use explicit definition if available, otherwise generic
    const specificDesc = standard?.grades[symptomSeverity as 1|2|3|4|5];
    return specificDesc || GENERIC_GRADES[symptomSeverity] || "暂无详细描述";
  }, [selectedSymptom, customSymptomText, symptomSeverity]);

  useEffect(() => {
    // Robust local date generation
    const date = new Date();
    const offset = date.getTimezoneOffset() * 60000;
    const today = (new Date(date.getTime() - offset)).toISOString().slice(0, 10);
    
    const todaysCheckIn = patient.history.checkIns.find(c => c.date === today);
    setDailyQuote(DAILY_QUOTES[Math.floor(Math.random() * DAILY_QUOTES.length)]);

    if (todaysCheckIn) {
        setIsCheckedInToday(true);
        setCheckInStep('RESULT');
        const symptoms = todaysCheckIn.symptomLog.map(s => s.specificSymptom);
        
        // Create details for CTCAE check
        const symptomDetails = todaysCheckIn.symptomLog.map(s => ({
            name: s.specificSymptom,
            severity: s.severity
        }));

        const advice = generateSmartAdvice(patient.currentTreatment, symptoms, todaysCheckIn.hadsResult, todaysCheckIn.dtScore, symptomDetails);
        setAdviceList(advice);
        if (todaysCheckIn.dtScore !== undefined) setDtScore(todaysCheckIn.dtScore);
        if (todaysCheckIn.medicationAdherence) setMedicationStatus(todaysCheckIn.medicationAdherence);
    } else {
        setCheckInStep('INTRO');
    }
  }, [patient]);

  // --- HADS LOGIC (Methods omitted for brevity, keeping existing) ---
  const handleHadsAnswer = (score: number) => {
      setHadsAnswers(prev => ({ ...prev, [HADS_QUESTIONS[currentHadsQuestion].id]: score }));
      if (currentHadsQuestion < HADS_QUESTIONS.length - 1) {
          setCurrentHadsQuestion(prev => prev + 1);
      } else {
          setCheckInStep('SYMPTOMS');
      }
  };

  const calculateScores = (): HADSResult => {
      let aScore = 0;
      let dScore = 0;
      HADS_QUESTIONS.forEach(q => {
          const score = hadsAnswers[q.id] || 0;
          if (q.category === 'A') aScore += score;
          else dScore += score;
      });
      return {
          anxietyScore: aScore,
          anxietyLevel: calculateHADSLevel(aScore),
          depressionScore: dScore,
          depressionLevel: calculateHADSLevel(dScore)
      };
  };

  // --- SYMPTOM LOGIC (Methods omitted for brevity, keeping existing) ---
  const handleBodyPartClick = (part: string) => {
    setActiveBodyPart(part);
    setModalSymptoms(SYMPTOM_OPTIONS[part] || SYMPTOM_OPTIONS['General']);
    setSelectedSymptom(null);
    setCustomSymptomText('');
    setSymptomSeverity(1);
    setSymptomDuration('半天');
  };

  const confirmSymptom = () => {
      const finalSymptomName = selectedSymptom === 'OTHER' ? customSymptomText : selectedSymptom;
      
      if (!finalSymptomName) return;

      const newEntry: SymptomEntry = {
        bodyPart: activeBodyPart || 'General',
        specificSymptom: finalSymptomName,
        severity: symptomSeverity,
        duration: symptomDuration
      };
      
      const existingIdx = symptomLog.findIndex(s => s.specificSymptom === finalSymptomName);
      let newLog = [...symptomLog];
      if (existingIdx >= 0) {
        newLog[existingIdx] = newEntry;
      } else {
        newLog.push(newEntry);
      }
      setSymptomLog(newLog);
      setActiveBodyPart(null);
  };

  const toggleQuickSymptom = (name: string) => {
      const existing = symptomLog.find(s => s.specificSymptom === name);
      if (existing) {
          setSymptomLog(symptomLog.filter(s => s.specificSymptom !== name));
      } else {
          const newEntry: SymptomEntry = {
              bodyPart: 'General',
              specificSymptom: name,
              severity: 1,
              duration: '半天'
          };
          setSymptomLog([...symptomLog, newEntry]);
      }
  };

  // --- SUBMIT ---
  const submitCheckIn = () => {
    const hadsResult = calculateScores();
    const symptoms = symptomLog.map(s => s.specificSymptom);
    
    // Create details for CTCAE check
    const symptomDetails = symptomLog.map(s => ({
        name: s.specificSymptom,
        severity: s.severity
    }));
    
    const advice = generateSmartAdvice(patient.currentTreatment, symptoms, hadsResult, dtScore, symptomDetails);
    setAdviceList(advice);

    // Robust local date generation
    const date = new Date();
    const offset = date.getTimezoneOffset() * 60000;
    const today = (new Date(date.getTime() - offset)).toISOString().slice(0, 10);

    const newCheckIn = {
      date: today,
      temperature: temp,
      weight: weight,
      dtScore: dtScore,
      medicationAdherence: medicationStatus,
      hadsResult: hadsResult,
      symptomLog: symptomLog,
      mood: 'Neutral' as const, 
      notes: ''
    };

    onUpdatePatient({
      ...patient,
      weight: weight,
      history: {
        ...patient.history,
        checkIns: [...patient.history.checkIns, newCheckIn]
      }
    });

    setIsCheckedInToday(true);
    setCheckInStep('RESULT');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- UKB AI GENERATION ---
  const handleGenerateUKBAdvice = async () => {
    if (!patient.ukbProfile) return;
    setIsGeneratingUKB(true);
    // PASS TREATMENT CONTEXT
    const advice = await generateLifestyleReport(patient.ukbProfile, patient.currentTreatment, patient.name);
    setUkbAdvice(advice);
    setIsGeneratingUKB(false);
  };

  const handleSaveUKB = () => {
      if(editingUKB) {
          onUpdatePatient({ ...patient, ukbProfile: editingUKB });
          setShowUKBEditModal(false);
          // Clear old advice as data changed
          setUkbAdvice(null);
      }
  };

  // --- WIDGET: DAILY GREETING ---
  const GreetingWidget = () => {
      const hour = new Date().getHours();
      const isMorning = hour >= 5 && hour < 12;
      const isAfternoon = hour >= 12 && hour < 18;
      const greeting = isMorning ? "早安" : isAfternoon ? "午安" : "晚上好";
      const Icon = isMorning ? Sun : Moon;
      const daysSince = Math.floor((new Date().getTime() - new Date(patient.treatmentStartDate || "2023-01-01").getTime()) / (1000 * 3600 * 24));

      return (
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-200 mb-8 relative overflow-hidden">
              <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                  <div className="md:col-span-2">
                      <div className="flex items-center gap-2 text-indigo-100 font-medium mb-2 text-sm">
                          <Icon className="w-4 h-4" /> {new Date().toLocaleDateString('zh-CN', { weekday: 'long', month: 'long', day: 'numeric' })}
                      </div>
                      <h2 className="text-3xl font-bold mb-4">{greeting}，{patient.name}</h2>
                      <div className="flex items-start gap-3 bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
                          <Quote className="w-8 h-8 text-indigo-200 opacity-50 flex-shrink-0" />
                          <p className="text-sm md:text-base italic opacity-90 leading-relaxed font-serif">
                              {dailyQuote}
                          </p>
                      </div>
                  </div>
                  <div className="hidden md:flex flex-col items-center justify-center bg-white/10 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
                      <span className="text-xs uppercase tracking-widest opacity-70 mb-1">抗癌旅程</span>
                      <span className="text-4xl font-bold font-mono">{daysSince}</span>
                      <span className="text-xs opacity-70 mt-1">天坚强守护</span>
                  </div>
              </div>
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl"></div>
              <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 bg-purple-400 opacity-20 rounded-full blur-2xl"></div>
          </div>
      );
  };

  const WeeklyReportNotification = () => (
      <div 
        onClick={() => setShowWeeklyReport(true)}
        className="bg-gradient-to-r from-amber-100 to-orange-100 rounded-xl p-4 mb-8 border border-amber-200 shadow-sm cursor-pointer hover:shadow-md transition-all flex items-center justify-between group"
      >
          <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                  <PieChart className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                  <h3 className="font-bold text-amber-900 flex items-center gap-2">
                      第 12 周健康守护报告已生成
                      <span className="bg-red-500 w-2 h-2 rounded-full animate-pulse"></span>
                  </h3>
                  <p className="text-xs text-amber-700/70">包含近期身心状态分析与生活建议</p>
              </div>
          </div>
          <div className="bg-white/50 p-2 rounded-full text-amber-600 group-hover:bg-white group-hover:text-amber-700 transition-colors">
              <ChevronRight className="w-5 h-5" />
          </div>
      </div>
  );

  const MedicalRecordModule = () => {
    // Medical records with date sorting
    const reports = patient.history.reports.filter(r => r.reportType === recordTab).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const allMetrics = useMemo(() => {
        const keys = new Set<string>();
        reports.forEach(r => Object.keys(r.metrics).forEach(k => keys.add(k)));
        return Array.from(keys);
    }, [reports]);

    const chartData = useMemo(() => {
        return [...reports].reverse().map(r => ({
            date: r.date,
            // Format YYYY-MM for better axis labels on long duration
            displayDate: r.date.substring(0, 7), 
            fullDate: r.date,
            ...r.metrics
        }));
    }, [reports]);

    if (recordMode === 'UPLOAD') {
      return (
        <div className="max-w-3xl mx-auto animate-scale-in">
           <button onClick={() => setRecordMode('LIST')} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-6">
             <ArrowLeft className="w-4 h-4" /> 返回列表
           </button>
           <SmartUpload onReportAnalyzed={(data) => {
               const updated = { ...patient, history: { ...patient.history, reports: [...patient.history.reports, data] }};
               onUpdatePatient(updated);
               setSelectedReport(data);
               setRecordMode('DETAIL');
           }} />
        </div>
      );
    }

    if (recordMode === 'DETAIL' && selectedReport) {
      return (
        <div className="max-w-7xl mx-auto animate-fade-in pb-20 relative">
          <div className="flex items-center justify-between mb-6">
             <div className="flex items-center gap-4">
                <button onClick={() => setRecordMode('LIST')} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  <ArrowLeft className="w-5 h-5 text-slate-600" />
                </button>
                <div>
                   <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                     {selectedReport.reportType === 'LAB' ? '检验报告' : 'CT 影像报告'}
                     <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{selectedReport.date}</span>
                   </h2>
                </div>
             </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[calc(100vh-200px)] min-h-[600px]">
             <div className="bg-black/5 rounded-2xl border border-slate-200 overflow-hidden relative group flex items-center justify-center bg-slate-100">
                {selectedReport.imageUrl ? (
                  <img src={selectedReport.imageUrl} alt="Original Report" className="max-w-full max-h-full object-contain" />
                ) : <div className="text-slate-400">原图未存档</div>}
             </div>
             <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                   <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                     <Sparkles className="w-5 h-5 text-indigo-600" /> AI 智能分析结果
                   </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                   <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100">
                      <h4 className="text-sm font-bold text-indigo-800 mb-2 flex items-center gap-2"><FileText className="w-4 h-4"/> 临床解读摘要</h4>
                      <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedReport.clinicalAnalysis || selectedReport.summary}</div>
                   </div>
                   <div className="space-y-3">
                      {/* Metric List with Normal Range Highlight */}
                      {Object.entries(selectedReport.metrics).map(([key, value]) => {
                         const range = REF_RANGES[key];
                         const isHigh = range && value > range.max;
                         const isLow = range && value < range.min;
                         const isAbnormal = isHigh || isLow;

                         return (
                            <div key={key} className={clsx("flex items-center justify-between p-4 rounded-xl border transition-colors", isAbnormal ? "border-red-100 bg-red-50/30" : "border-slate-100")}>
                               <div>
                                  <div className="flex items-center gap-2">
                                     <span className={clsx("text-sm font-medium", isAbnormal ? "text-red-700" : "text-slate-700")}>{METRIC_DICT[key] || key}</span>
                                     {isHigh && <ArrowUp className="w-3 h-3 text-red-500 font-bold" />}
                                     {isLow && <ArrowDown className="w-3 h-3 text-red-500 font-bold" />}
                                  </div>
                                  {range && (
                                     <div className="text-xs text-slate-400 mt-0.5">
                                        参考值: {range.min} - {range.max} <span className="scale-75 inline-block origin-left">{range.unit}</span>
                                     </div>
                                  )}
                               </div>
                               <span className={clsx("text-lg font-mono font-bold", isAbnormal ? "text-red-600" : "text-slate-800")}>{value}</span>
                            </div>
                         );
                      })}
                   </div>
                </div>
             </div>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-6xl mx-auto animate-fade-in pb-20">
        <div className="flex justify-between items-end mb-8">
           <div>
             <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
               <Activity className="w-7 h-7 text-indigo-600" /> 医疗档案中心
             </h2>
             <p className="text-slate-500 mt-2">您的专属健康数据银行。</p>
           </div>
           <button onClick={() => setRecordMode('UPLOAD')} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg flex items-center gap-2">
             <Plus className="w-5 h-5" /> 上传新报告
           </button>
        </div>

        <div className="flex gap-4 mb-6 border-b border-slate-200 pb-2">
            {[
                { id: 'LAB', label: '血常规 / 生化' },
                { id: 'CT', label: 'CT 影像专栏' }
            ].map(tab => (
                <button 
                    key={tab.id}
                    onClick={() => setRecordTab(tab.id as any)}
                    className={clsx(
                        "px-6 py-2 rounded-lg font-bold text-sm transition-all relative",
                        recordTab === tab.id ? "text-indigo-600 bg-indigo-50" : "text-slate-500 hover:bg-slate-50"
                    )}
                >
                    {tab.label}
                    {recordTab === tab.id && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-full" />}
                </button>
            ))}
        </div>

        {recordTab === 'LAB' && allMetrics.length > 0 && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-indigo-600" /> 核心指标合并趋势
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 px-3 py-1 rounded-full">
                        <div className="w-3 h-3 bg-slate-200/50 rounded-sm"></div> 
                        灰色区域代表医学参考正常范围
                    </div>
                </div>
                <div className="flex flex-wrap gap-3 mb-6">
                    {allMetrics.map((m, i) => (
                        <button 
                            key={m}
                            onClick={() => {
                                if (selectedMetrics.includes(m)) setSelectedMetrics(selectedMetrics.filter(x => x !== m));
                                else setSelectedMetrics([...selectedMetrics, m]);
                            }}
                            className={clsx(
                                "px-3 py-1.5 rounded-full text-xs font-bold border transition-all flex items-center gap-2",
                                selectedMetrics.includes(m) ? "bg-white shadow-sm ring-1" : "bg-slate-50 border-slate-100 text-slate-400 opacity-60 grayscale"
                            )}
                            style={selectedMetrics.includes(m) ? { 
                                color: CHART_COLORS[i % CHART_COLORS.length], 
                                borderColor: CHART_COLORS[i % CHART_COLORS.length], 
                                '--tw-ring-color': CHART_COLORS[i % CHART_COLORS.length] 
                            } as React.CSSProperties : {}}
                        >
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedMetrics.includes(m) ? CHART_COLORS[i % CHART_COLORS.length] : '#cbd5e1' }} />
                            {METRIC_DICT[m] || m}
                        </button>
                    ))}
                </div>
                <div className="h-[400px] w-full bg-gradient-to-b from-white to-slate-50/50 rounded-xl p-2 relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis 
                                dataKey="displayDate" 
                                stroke="#94a3b8" 
                                fontSize={12} 
                                tickMargin={10}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis 
                                stroke="#94a3b8" 
                                fontSize={12} 
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                                itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                                labelStyle={{ color: '#64748b', marginBottom: '8px', fontSize: '12px' }}
                                labelFormatter={(label, payload) => {
                                    if (payload && payload.length > 0) return payload[0].payload.fullDate;
                                    return label;
                                }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle"/>
                            
                            {/* Render Reference Areas for selected metrics */}
                            {selectedMetrics.map((m, i) => {
                                const range = REF_RANGES[m];
                                if (!range) return null;
                                return (
                                    <ReferenceArea 
                                        key={`ref-${m}`}
                                        y1={range.min} 
                                        y2={range.max} 
                                        fill={CHART_COLORS[i % CHART_COLORS.length]} 
                                        fillOpacity={0.05}
                                        strokeOpacity={0}
                                        ifOverflow="extendDomain"
                                    />
                                );
                            })}

                            {selectedMetrics.map((m, i) => (
                                <Line 
                                    key={m} 
                                    type="monotone" 
                                    dataKey={m} 
                                    name={METRIC_DICT[m] || m}
                                    stroke={CHART_COLORS[i % CHART_COLORS.length]} 
                                    strokeWidth={3} 
                                    dot={{r: 4, strokeWidth: 2, fill: '#fff'}} 
                                    activeDot={{r: 6, strokeWidth: 0}}
                                    connectNulls
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        )}

        <div className="space-y-4">
            {reports.map(r => (
                <div key={r.id} onClick={() => { setSelectedReport(r); setRecordMode('DETAIL'); }} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group flex justify-between items-center">
                    <div className="flex items-start gap-4">
                        <div className={clsx("w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white shadow-sm shrink-0", r.reportType === 'LAB' ? "bg-blue-500" : "bg-purple-500")}>
                            {r.reportType}
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <span className="font-bold text-slate-800">{r.date}</span>
                                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">ID: {r.id}</span>
                            </div>
                            <p className="text-slate-600 text-sm max-w-2xl line-clamp-1">{r.summary}</p>
                            {/* Summary Metrics Preview */}
                            <div className="flex flex-wrap gap-2 mt-2">
                                {Object.entries(r.metrics).slice(0, 4).map(([k, v]) => {
                                    const range = REF_RANGES[k];
                                    const isAbnormal = range && (v > range.max || v < range.min);
                                    return (
                                        <span key={k} className={clsx(
                                            "text-[10px] px-2 py-1 rounded border",
                                            isAbnormal ? "bg-red-50 border-red-100 text-red-600 font-bold" : "bg-slate-50 border-slate-100 text-slate-500"
                                        )}>
                                            {k}: {v}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500" />
                </div>
            ))}
        </div>
      </div>
    );
  };

  const UKBRiskProfileView = () => {
    if (!patient.ukbProfile) return <div className="text-center p-10 text-slate-500">暂无 UK Biobank 数据，请联系管理员完善档案。</div>;

    const { ukbProfile } = patient;

    // --- Simple Scoring Algorithm ---
    
    // 1. Tobacco Score: Base 100. If current smoker -> 0. Previous -> 60. Minus pack years.
    let tobaccoScore = ukbProfile.smokingStatus === 0 ? 100 : (ukbProfile.smokingStatus === 1 ? 60 : 20);
    tobaccoScore = Math.max(0, tobaccoScore - (ukbProfile.packYears));

    // 2. Sleep Score: Ideal 7-8 hours = 100. Deviate by 1 hour = -15. Quality adds up to 10 points.
    let sleepDist = Math.abs(ukbProfile.sleepDuration - 7.5);
    let sleepScore = Math.max(0, 90 - (sleepDist * 20)) + ukbProfile.sleepQualityScore; // Max 100

    // 3. Respiratory Score: Shortness of Breath (0-4) is heavy penalty. Wheezing is penalty.
    let respScore = 100 - (ukbProfile.shortnessOfBreath * 20) - (ukbProfile.hasWheezing ? 15 : 0);

    // 4. Activity Score: High(2)=100, Mod(1)=70, Low(0)=40. Add freq bonus.
    let activityScore = ukbProfile.activityLevel === 2 ? 90 : (ukbProfile.activityLevel === 1 ? 70 : 40);
    activityScore += Math.min(10, ukbProfile.weeklyExerciseFreq * 2);

    // 5. Nutrition Score: Complex logic for new fields
    // Base 60. Add fruits, veggies, fish. Subtract processed meat, sugar.
    let nutritionScore = 60;
    nutritionScore += (ukbProfile.fruitIntake * 5); // +5 per fruit
    nutritionScore += ((ukbProfile.cookedVegIntake + ukbProfile.rawVegIntake) * 3); // +3 per veg spoon
    if (ukbProfile.oilyFishIntake >= 1) nutritionScore += 10;
    if (ukbProfile.oilyFishIntake >= 2) nutritionScore += 5; // Bonus for 2+
    
    // Penalties
    if (ukbProfile.redMeatIntake >= 3) nutritionScore -= 10; // High red meat
    if (ukbProfile.processedMeatIntake >= 1) nutritionScore -= (ukbProfile.processedMeatIntake * 10);
    nutritionScore -= (ukbProfile.sugaryBeverageIntake * 5);

    nutritionScore = Math.max(0, Math.min(100, nutritionScore));


    const radarData = [
        { subject: '烟草控制', A: tobaccoScore, fullMark: 100 },
        { subject: '优质睡眠', A: sleepScore, fullMark: 100 },
        { subject: '心肺耐力', A: respScore, fullMark: 100 },
        { subject: '身体活跃度', A: activityScore, fullMark: 100 },
        { subject: '营养均衡', A: nutritionScore, fullMark: 100 },
    ];

    const overallScore = Math.round(radarData.reduce((a, b) => a + b.A, 0) / 5);

    return (
        <div className="max-w-6xl mx-auto animate-fade-in pb-20">
            {/* Header */}
            <div className="mb-8 flex justify-between items-end">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                        <Fingerprint className="w-7 h-7 text-indigo-600" /> 生命时光 · 全维健康图谱
                    </h2>
                    <p className="text-slate-500 mt-2">基于 UK Biobank 标准的生命力监测模型，为您守护每一份生机。</p>
                </div>
                <button 
                    onClick={() => { setEditingUKB(patient.ukbProfile); setShowUKBEditModal(true); }}
                    className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl shadow-sm hover:bg-slate-50 hover:text-indigo-600 transition-all font-bold text-sm"
                >
                    <Edit2 className="w-4 h-4" /> 更新我的生活状态
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left: Radar & Overall */}
                <div className="lg:col-span-1 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                    <div className="relative w-full h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                                <PolarGrid stroke="#e2e8f0" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar name="健康得分" dataKey="A" stroke="#6366f1" strokeWidth={3} fill="#818cf8" fillOpacity={0.3} />
                                <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                            </RadarChart>
                        </ResponsiveContainer>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                            <div className="text-4xl font-black text-indigo-600 tracking-tight">{overallScore}</div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">活力指数</div>
                        </div>
                    </div>
                </div>

                {/* Right: Detailed Cards */}
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Smoking */}
                    <div className={clsx("p-5 rounded-2xl border flex items-start gap-4 transition-all hover:shadow-md", ukbProfile.smokingStatus === 2 ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100")}>
                        <div className={clsx("p-3 rounded-full shrink-0", ukbProfile.smokingStatus === 2 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600")}>
                            <Cigarette className="w-6 h-6" />
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-800">烟草暴露</h4>
                            <p className="text-sm text-slate-600 mt-1">
                                {ukbProfile.smokingStatus === 2 ? "当前吸烟 (高风险)" : ukbProfile.smokingStatus === 1 ? "已戒烟 (值得鼓励)" : "从不吸烟 (保持优秀)"}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">累积包年: {ukbProfile.packYears}年</p>
                        </div>
                    </div>

                    {/* Respiratory */}
                    <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 flex items-start gap-4 transition-all hover:shadow-md">
                        <div className="p-3 bg-blue-100 rounded-full text-blue-600 shrink-0">
                            <Wind className="w-6 h-6" />
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-800">呼吸功能储备</h4>
                            <p className="text-sm text-slate-600 mt-1">
                                气短程度: {ukbProfile.shortnessOfBreath === 0 ? "无气短" : ukbProfile.shortnessOfBreath + " 级"}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">喘鸣症状: {ukbProfile.hasWheezing ? "偶有" : "无"}</p>
                        </div>
                    </div>

                    {/* Sleep */}
                    <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100 flex items-start gap-4 transition-all hover:shadow-md">
                        <div className="p-3 bg-purple-100 rounded-full text-purple-600 shrink-0">
                            <Moon className="w-6 h-6" />
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-800">睡眠修复力</h4>
                            <p className="text-sm text-slate-600 mt-1">
                                每日时长: {ukbProfile.sleepDuration}小时
                            </p>
                            <div className="flex items-center gap-1 mt-1">
                                <span className="text-xs text-slate-400">质量评分:</span>
                                <div className="flex gap-0.5">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className={clsx("w-1.5 h-1.5 rounded-full", i < (ukbProfile.sleepQualityScore / 2) ? "bg-purple-400" : "bg-purple-200")}></div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Nutrition & Activity */}
                    <div className="bg-orange-50 p-5 rounded-2xl border border-orange-100 flex items-start gap-4 transition-all hover:shadow-md">
                        <div className="p-3 bg-orange-100 rounded-full text-orange-600 shrink-0">
                            <Apple className="w-6 h-6" />
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-800">营养与运动</h4>
                            <p className="text-sm text-slate-600 mt-1">
                                运动: {ukbProfile.activityLevel === 0 ? "需加强" : ukbProfile.activityLevel === 1 ? "适中" : "充沛"}
                            </p>
                            <div className="flex gap-2 mt-1">
                                <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">蔬果 {ukbProfile.fruitIntake + ukbProfile.cookedVegIntake + ukbProfile.rawVegIntake}份</span>
                                {ukbProfile.processedMeatIntake > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded">加工肉警示</span>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Generation Section */}
            <div className="mt-8">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-indigo-600" /> AI 康复挚友 · 深度关怀建议
                    </h3>
                    {!ukbAdvice && (
                        <button 
                            onClick={handleGenerateUKBAdvice}
                            disabled={isGeneratingUKB}
                            className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-70 flex items-center gap-2 hover:-translate-y-0.5"
                        >
                            {isGeneratingUKB ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                            生成我的专属建议
                        </button>
                    )}
                </div>

                {isGeneratingUKB && (
                    <div className="bg-white p-12 rounded-2xl border border-slate-100 text-center animate-pulse flex flex-col items-center">
                        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                        </div>
                        <h4 className="text-slate-800 font-bold mb-2">正在分析全维数据...</h4>
                        <p className="text-slate-500 text-sm">AI 正在结合您的治疗方案 {patient.currentTreatment} 进行个性化思考</p>
                    </div>
                )}

                {ukbAdvice && (
                    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-lg shadow-slate-100/50 animate-fade-in relative overflow-hidden">
                        {/* Decorative Background */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-indigo-50 to-purple-50 rounded-bl-full -z-10"></div>
                        
                        <div className="flex gap-4 mb-6">
                            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center shrink-0 border-2 border-white shadow-sm">
                                <Sparkles className="w-6 h-6 text-indigo-600" />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800 text-lg">来自您的 AI 康复顾问</h4>
                                <p className="text-xs text-slate-400">{new Date().toLocaleString()}</p>
                            </div>
                        </div>

                        <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-li:marker:text-indigo-500">
                            <div className="whitespace-pre-wrap text-slate-700">
                                {ukbAdvice}
                            </div>
                        </div>
                        
                        <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                            <button onClick={() => setUkbAdvice(null)} className="text-sm font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition-colors">
                                <ArrowRight className="w-4 h-4" /> 重新生成建议
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* --- EDIT MODAL --- */}
            {showUKBEditModal && editingUKB && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="bg-white p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">更新生活状态图谱</h3>
                                <p className="text-xs text-slate-500 mt-1">基于 UK Biobank 标准维度 (ID: 20116, 20535, 4717...)</p>
                            </div>
                            <button onClick={() => setShowUKBEditModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X className="w-5 h-5"/></button>
                        </div>

                        {/* Scrollable Content */}
                        <div className="p-8 overflow-y-auto space-y-8 bg-slate-50/50">
                            
                            {/* 1. Smoking Section */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="p-2 bg-red-100 rounded-lg text-red-600"><Cigarette className="w-5 h-5"/></div>
                                    <h4 className="font-bold text-slate-800">烟草暴露 (Smoking)</h4>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">当前吸烟状态</label>
                                        <div className="flex gap-2">
                                            {[
                                                { val: 0, label: '从不吸烟' },
                                                { val: 1, label: '已戒烟' },
                                                { val: 2, label: '当前吸烟' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.val}
                                                    onClick={() => setEditingUKB({...editingUKB, smokingStatus: opt.val as 0|1|2})}
                                                    className={clsx(
                                                        "flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all",
                                                        editingUKB.smokingStatus === opt.val 
                                                            ? "bg-red-50 border-red-200 text-red-700 ring-1 ring-red-100" 
                                                            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                                    )}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {editingUKB.smokingStatus !== 0 && (
                                        <div className="animate-fade-in">
                                            <label className="block text-sm font-bold text-slate-700 mb-2 flex justify-between">
                                                <span>累积吸烟包年数 (Pack Years)</span>
                                                <span className="text-red-600">{editingUKB.packYears} 年</span>
                                            </label>
                                            <div className="flex items-center gap-4">
                                                <button onClick={() => setEditingUKB({...editingUKB, packYears: Math.max(0, editingUKB.packYears - 1)})} className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center">-</button>
                                                <input 
                                                    type="range" min="0" max="100" step="1"
                                                    value={editingUKB.packYears}
                                                    onChange={(e) => setEditingUKB({...editingUKB, packYears: Number(e.target.value)})}
                                                    className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600"
                                                />
                                                <button onClick={() => setEditingUKB({...editingUKB, packYears: editingUKB.packYears + 1})} className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center">+</button>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-2">* 包年数 = (每天吸烟包数) × (吸烟年数)</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 2. Respiratory Section (New) */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><Wind className="w-5 h-5"/></div>
                                    <h4 className="font-bold text-slate-800">呼吸症状 (Respiratory)</h4>
                                </div>
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2 flex justify-between">
                                            <span>气短程度 (MRC分级 0-4)</span>
                                            <span className="text-blue-600 font-mono">{editingUKB.shortnessOfBreath} 级</span>
                                        </label>
                                        <input 
                                            type="range" min="0" max="4" step="1"
                                            value={editingUKB.shortnessOfBreath}
                                            onChange={(e) => setEditingUKB({...editingUKB, shortnessOfBreath: Number(e.target.value) as any})}
                                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 mb-2"
                                        />
                                        <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                                            {editingUKB.shortnessOfBreath === 0 && "0级: 仅在剧烈运动时感到气短"}
                                            {editingUKB.shortnessOfBreath === 1 && "1级: 平地快走或上小坡时气短"}
                                            {editingUKB.shortnessOfBreath === 2 && "2级: 平地行走比同龄人慢，或需停下休息"}
                                            {editingUKB.shortnessOfBreath === 3 && "3级: 平地行走100米左右需停下休息"}
                                            {editingUKB.shortnessOfBreath === 4 && "4级: 极严重，穿衣或静息时也感到气短"}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-bold text-slate-700">近一年是否有喘鸣/啸鸣音?</label>
                                        <button 
                                            onClick={() => setEditingUKB({...editingUKB, hasWheezing: !editingUKB.hasWheezing})}
                                            className={clsx(
                                                "w-12 h-6 rounded-full transition-colors relative",
                                                editingUKB.hasWheezing ? "bg-blue-600" : "bg-slate-300"
                                            )}
                                        >
                                            <div className={clsx("absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm", editingUKB.hasWheezing ? "left-7" : "left-1")} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* 3. Sleep Section */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="p-2 bg-purple-100 rounded-lg text-purple-600"><BedDouble className="w-5 h-5"/></div>
                                    <h4 className="font-bold text-slate-800">睡眠质量 (Sleep)</h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">每晚睡眠时长</label>
                                        <div className="flex items-center gap-3">
                                            <input 
                                                type="number" 
                                                value={editingUKB.sleepDuration}
                                                onChange={(e) => setEditingUKB({...editingUKB, sleepDuration: Number(e.target.value)})}
                                                className="w-20 px-3 py-2 border border-slate-200 rounded-lg text-center font-bold text-purple-600 focus:ring-2 focus:ring-purple-500 outline-none"
                                            />
                                            <span className="text-sm text-slate-500">小时</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-1">
                                            主观质量评分 <Star className="w-3 h-3 text-yellow-400 fill-yellow-400"/>
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <input 
                                                type="range" min="1" max="10" step="1"
                                                value={editingUKB.sleepQualityScore}
                                                onChange={(e) => setEditingUKB({...editingUKB, sleepQualityScore: Number(e.target.value)})}
                                                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                            />
                                            <span className="font-bold text-purple-600 w-8 text-right">{editingUKB.sleepQualityScore}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 4. Activity Section */}
                            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="p-2 bg-orange-100 rounded-lg text-orange-600"><PersonStanding className="w-5 h-5"/></div>
                                    <h4 className="font-bold text-slate-800">运动活力 (Activity)</h4>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">IPAQ 活力分组</label>
                                        <div className="flex gap-2">
                                            {[
                                                { val: 0, label: '低 (久坐)' },
                                                { val: 1, label: '中等' },
                                                { val: 2, label: '高 (活跃)' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.val}
                                                    onClick={() => setEditingUKB({...editingUKB, activityLevel: opt.val as 0|1|2})}
                                                    className={clsx(
                                                        "flex-1 py-2 rounded-lg text-sm font-medium border transition-all",
                                                        editingUKB.activityLevel === opt.val 
                                                            ? "bg-orange-50 border-orange-200 text-orange-700 font-bold" 
                                                            : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                                    )}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                                            <Zap className="w-4 h-4 text-orange-400"/> 每周剧烈运动天数
                                        </label>
                                        <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                            <button onClick={() => setEditingUKB({...editingUKB, weeklyExerciseFreq: Math.max(0, editingUKB.weeklyExerciseFreq - 1)})} className="w-8 h-8 rounded-full bg-white shadow-sm text-slate-600 font-bold hover:bg-slate-100">-</button>
                                            <span className="flex-1 text-center font-bold text-slate-800">{editingUKB.weeklyExerciseFreq} 天/周</span>
                                            <button onClick={() => setEditingUKB({...editingUKB, weeklyExerciseFreq: Math.min(7, editingUKB.weeklyExerciseFreq + 1)})} className="w-8 h-8 rounded-full bg-white shadow-sm text-slate-600 font-bold hover:bg-slate-100">+</button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                             {/* 5. Diet Section (Expanded) */}
                             <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="p-2 bg-green-100 rounded-lg text-green-600"><Apple className="w-5 h-5"/></div>
                                    <h4 className="font-bold text-slate-800">饮食营养 (Diet & Inflammation)</h4>
                                </div>
                                <div className="space-y-6">
                                    {/* Plant Based */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">新鲜水果 (份/天)</label>
                                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg">
                                                 <button onClick={() => setEditingUKB({...editingUKB, fruitIntake: Math.max(0, editingUKB.fruitIntake - 1)})} className="w-6 h-6 rounded-md bg-white shadow-sm">-</button>
                                                 <span className="flex-1 text-center font-bold">{editingUKB.fruitIntake}</span>
                                                 <button onClick={() => setEditingUKB({...editingUKB, fruitIntake: editingUKB.fruitIntake + 1})} className="w-6 h-6 rounded-md bg-white shadow-sm">+</button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">熟食蔬菜 (勺/天)</label>
                                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg">
                                                 <button onClick={() => setEditingUKB({...editingUKB, cookedVegIntake: Math.max(0, editingUKB.cookedVegIntake - 1)})} className="w-6 h-6 rounded-md bg-white shadow-sm">-</button>
                                                 <span className="flex-1 text-center font-bold">{editingUKB.cookedVegIntake}</span>
                                                 <button onClick={() => setEditingUKB({...editingUKB, cookedVegIntake: editingUKB.cookedVegIntake + 1})} className="w-6 h-6 rounded-md bg-white shadow-sm">+</button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">生食沙拉 (勺/天)</label>
                                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg">
                                                 <button onClick={() => setEditingUKB({...editingUKB, rawVegIntake: Math.max(0, editingUKB.rawVegIntake - 1)})} className="w-6 h-6 rounded-md bg-white shadow-sm">-</button>
                                                 <span className="flex-1 text-center font-bold">{editingUKB.rawVegIntake}</span>
                                                 <button onClick={() => setEditingUKB({...editingUKB, rawVegIntake: editingUKB.rawVegIntake + 1})} className="w-6 h-6 rounded-md bg-white shadow-sm">+</button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Proteins & Risks */}
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">红肉摄入频率 (牛/羊/猪)</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { val: 0, label: '从不' }, { val: 1, label: '<1次/周' }, { val: 2, label: '1次/周' },
                                                { val: 3, label: '2-4次/周' }, { val: 4, label: '5-6次/周' }, { val: 5, label: '每天≥1' }
                                            ].map(opt => (
                                                <button key={opt.val} onClick={() => setEditingUKB({...editingUKB, redMeatIntake: opt.val as any})} 
                                                    className={clsx("py-1.5 rounded-lg text-xs font-medium border", editingUKB.redMeatIntake === opt.val ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-slate-200 text-slate-500")}>
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">加工肉类 (香肠/腊肉)</label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {[
                                                { val: 0, label: '从不' }, { val: 1, label: '<1次/周' }, { val: 2, label: '1次/周' }, { val: 3, label: '每天≥1' }
                                            ].map(opt => (
                                                <button key={opt.val} onClick={() => setEditingUKB({...editingUKB, processedMeatIntake: opt.val as any})} 
                                                    className={clsx("py-1.5 rounded-lg text-xs font-medium border", editingUKB.processedMeatIntake === opt.val ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-slate-200 text-slate-500")}>
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-1"><Fish className="w-4 h-4 text-blue-500"/> 油性鱼类 (次/周)</label>
                                            <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-lg border border-blue-100">
                                                 <button onClick={() => setEditingUKB({...editingUKB, oilyFishIntake: Math.max(0, editingUKB.oilyFishIntake - 1)})} className="w-8 h-8 rounded-md bg-white shadow-sm">-</button>
                                                 <span className="flex-1 text-center font-bold text-blue-700">{editingUKB.oilyFishIntake}</span>
                                                 <button onClick={() => setEditingUKB({...editingUKB, oilyFishIntake: editingUKB.oilyFishIntake + 1})} className="w-8 h-8 rounded-md bg-white shadow-sm">+</button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-1"><Coffee className="w-4 h-4 text-amber-500"/> 含糖饮料 (杯/周)</label>
                                            <div className="flex items-center gap-2 bg-amber-50 p-2 rounded-lg border border-amber-100">
                                                 <button onClick={() => setEditingUKB({...editingUKB, sugaryBeverageIntake: Math.max(0, editingUKB.sugaryBeverageIntake - 1)})} className="w-8 h-8 rounded-md bg-white shadow-sm">-</button>
                                                 <span className="flex-1 text-center font-bold text-amber-700">{editingUKB.sugaryBeverageIntake}</span>
                                                 <button onClick={() => setEditingUKB({...editingUKB, sugaryBeverageIntake: editingUKB.sugaryBeverageIntake + 1})} className="w-8 h-8 rounded-md bg-white shadow-sm">+</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                        
                        {/* Footer Actions */}
                        <div className="p-4 border-t border-slate-100 bg-white flex gap-3 shrink-0 z-10">
                            <button onClick={() => setShowUKBEditModal(false)} className="flex-1 py-3.5 text-slate-500 font-bold hover:text-slate-700 hover:bg-slate-50 rounded-xl transition-colors">取消</button>
                            <button onClick={handleSaveUKB} className="flex-[2] bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 hover:shadow-indigo-200 hover:-translate-y-0.5">
                                <Check className="w-5 h-5" /> 保存更新
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
  };

  const CareCenterView = () => {
    return (
      <div className="max-w-4xl mx-auto pb-24 animate-fade-in relative">
        <GreetingWidget />
        <WeeklyReportNotification />
        
        {showWeeklyReport && <WeeklyInsights patient={patient} onClose={() => setShowWeeklyReport(false)} />}

        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden relative min-h-[500px]">
          
          {!isCheckedInToday && checkInStep !== 'INTRO' && (
             <div className="h-1.5 bg-slate-100 w-full">
                <div 
                   className="h-full bg-indigo-600 transition-all duration-500" 
                   style={{ width: checkInStep === 'VITALS' ? '20%' : checkInStep === 'MEDS' ? '40%' : checkInStep === 'DT' ? '60%' : checkInStep === 'HADS' ? '80%' : '95%' }}
                />
             </div>
          )}

          {!isCheckedInToday && checkInStep === 'INTRO' && (
             <div className="p-10 flex flex-col items-center justify-center h-[500px] text-center">
                 <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mb-8 animate-bounce-slow">
                     <CalendarCheck className="w-10 h-10 text-indigo-600" />
                 </div>
                 <h2 className="text-3xl font-bold text-slate-800 mb-3">每日健康打卡</h2>
                 <p className="text-slate-500 mb-8 max-w-md leading-relaxed">
                     记录体征、症状与心情，AI 将结合 CTCAE 标准为您生成今日护理建议，并监控不良反应风险。
                 </p>
                 <button 
                    onClick={() => setCheckInStep('VITALS')} 
                    className="bg-indigo-600 text-white px-12 py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 hover:scale-105 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
                 >
                    开始今日记录 <ArrowRight className="w-5 h-5" />
                 </button>
             </div>
          )}

          {!isCheckedInToday && checkInStep === 'VITALS' && (
             <div className="p-8 md:p-12">
                 <h3 className="text-xl font-bold text-slate-800 mb-8 flex items-center gap-2">
                     <Thermometer className="w-6 h-6 text-indigo-600" /> 今日体征数据
                 </h3>
                 <div className="space-y-8 max-w-lg mx-auto">
                     <div>
                         <label className="block text-sm font-bold text-slate-700 mb-3">体温 (℃)</label>
                         <div className="flex items-center gap-4">
                             <input 
                                type="range" min="35" max="42" step="0.1" 
                                value={temp} 
                                onChange={(e) => setTemp(Number(e.target.value))}
                                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                             />
                             <span className="text-2xl font-bold text-indigo-600 w-20 text-right">{temp}</span>
                         </div>
                     </div>
                     <div>
                         <label className="block text-sm font-bold text-slate-700 mb-3">体重 (kg)</label>
                         <div className="flex items-center gap-4">
                             <input 
                                type="range" min="30" max="100" step="0.1" 
                                value={weight} 
                                onChange={(e) => setWeight(Number(e.target.value))}
                                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                             />
                             <span className="text-2xl font-bold text-indigo-600 w-20 text-right">{weight}</span>
                         </div>
                     </div>
                 </div>
                 <div className="mt-12 flex justify-end">
                     <button onClick={() => setCheckInStep('MEDS')} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center gap-2">
                         下一步 <ArrowRight className="w-4 h-4" />
                     </button>
                 </div>
             </div>
          )}

          {!isCheckedInToday && checkInStep === 'MEDS' && (
              <div className="p-8 md:p-12">
                  <h3 className="text-xl font-bold text-slate-800 mb-8 flex items-center gap-2">
                      <Pill className="w-6 h-6 text-indigo-600" /> 服药情况确认
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {[
                          { val: 'Taken', label: '已按时服用', icon: CheckCircle, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                          { val: 'Skipped', label: '漏服 / 忘服', icon: AlertCircle, color: 'bg-orange-50 text-orange-700 border-orange-200' },
                          { val: 'Not Required', label: '今日无需服药', icon: CalendarCheck, color: 'bg-slate-50 text-slate-700 border-slate-200' }
                      ].map((opt) => (
                          <button
                              key={opt.val}
                              onClick={() => setMedicationStatus(opt.val as any)}
                              className={clsx(
                                  "p-6 rounded-2xl border-2 flex flex-col items-center justify-center gap-4 transition-all h-48",
                                  medicationStatus === opt.val ? opt.color + " ring-4 ring-slate-100" : "bg-white border-slate-100 hover:border-slate-300 text-slate-500"
                              )}
                          >
                              <opt.icon className="w-10 h-10" />
                              <span className="font-bold text-lg">{opt.label}</span>
                          </button>
                      ))}
                  </div>
                  <div className="mt-12 flex justify-end">
                      <button onClick={() => setCheckInStep('DT')} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center gap-2">
                          下一步 <ArrowRight className="w-4 h-4" />
                      </button>
                  </div>
              </div>
          )}

          {!isCheckedInToday && checkInStep === 'DT' && (
              <div className="p-8 md:p-12">
                  <h3 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
                      <BrainCircuit className="w-6 h-6 text-indigo-600" /> 心理痛苦温度计 (DT)
                  </h3>
                  <p className="text-slate-500 mb-8 text-sm">请评估您过去一周所经历的心理痛苦程度（0 = 无痛苦，10 = 极度痛苦）</p>
                  
                  <div className="relative h-64 flex items-center justify-center max-w-lg mx-auto">
                      <div className="absolute left-0 top-0 bottom-0 w-2 rounded-full bg-gradient-to-t from-green-400 via-yellow-400 to-red-500"></div>
                      <input 
                          type="range" 
                          min="0" max="10" step="1"
                          value={dtScore}
                          onChange={(e) => setDtScore(Number(e.target.value))}
                          className="absolute -rotate-90 w-64 h-2 bg-transparent appearance-none cursor-pointer origin-center z-10"
                          style={{ left: '-120px' }} 
                      />
                      <div className="flex flex-col items-center gap-2 ml-20">
                           <span className={clsx("text-6xl font-black transition-colors", dtScore < 4 ? "text-green-500" : dtScore < 7 ? "text-orange-500" : "text-red-500")}>{dtScore}</span>
                           <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                               {dtScore < 4 ? "适应良好" : dtScore < 7 ? "有些压力" : "需要帮助"}
                           </span>
                      </div>
                  </div>

                  <div className="mt-12 flex justify-end">
                      <button onClick={() => setCheckInStep('HADS')} className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all flex items-center gap-2">
                          下一步 <ArrowRight className="w-4 h-4" />
                      </button>
                  </div>
              </div>
          )}

           {!isCheckedInToday && checkInStep === 'HADS' && (
               <div className="p-8 md:p-12 flex flex-col h-[500px]">
                   <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                       <Smile className="w-6 h-6 text-indigo-600" /> 情绪自评 (HADS)
                   </h3>
                   <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full">
                       <div className="mb-8">
                           <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded mb-2 inline-block">问题 {currentHadsQuestion + 1} / {HADS_QUESTIONS.length}</span>
                           <h4 className="text-2xl font-bold text-slate-800 leading-relaxed">
                               {HADS_QUESTIONS[currentHadsQuestion].text}
                           </h4>
                       </div>
                       <div className="grid gap-3">
                           {HADS_QUESTIONS[currentHadsQuestion].options.map((opt, idx) => (
                               <button 
                                   key={idx}
                                   onClick={() => handleHadsAnswer(HADS_QUESTIONS[currentHadsQuestion].scores[idx])}
                                   className="text-left p-4 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all font-medium text-slate-700 hover:text-indigo-700"
                               >
                                   {opt}
                               </button>
                           ))}
                       </div>
                   </div>
               </div>
           )}

           {!isCheckedInToday && checkInStep === 'SYMPTOMS' && (
               <div className="flex flex-col h-[700px]">
                   <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white z-10">
                       <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                           <PersonStanding className="w-6 h-6 text-indigo-600" /> 症状定位与记录
                       </h3>
                       <button onClick={submitCheckIn} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 flex items-center gap-2">
                           完成打卡 <CheckCircle className="w-4 h-4" />
                       </button>
                   </div>
                   
                   <div className="flex-1 overflow-hidden relative flex">
                       <div className="w-1/2 bg-slate-50 flex items-center justify-center relative border-r border-slate-100">
                           <BodyMap onPartClick={handleBodyPartClick} selectedParts={Array.from(new Set(symptomLog.map(s => s.bodyPart)))} />
                       </div>

                       <div className="w-1/2 bg-white p-6 overflow-y-auto">
                           {symptomLog.length === 0 ? (
                               <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                   <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                       <Activity className="w-8 h-8 text-slate-300" />
                                   </div>
                                   <p>点击左侧身体部位记录不适</p>
                                   <p className="text-sm mt-2">或</p>
                                   <div className="mt-4 flex flex-wrap gap-2 justify-center">
                                       <button onClick={() => toggleQuickSymptom("无明显不适")} className="px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-bold border border-green-200 hover:bg-green-100">
                                           今日无不适
                                       </button>
                                   </div>
                               </div>
                           ) : (
                               <div className="space-y-4">
                                   <h4 className="font-bold text-slate-800 mb-4">已记录的症状</h4>
                                   {symptomLog.map((s, i) => (
                                       <div key={i} className="p-4 bg-white border border-slate-100 rounded-xl shadow-sm flex justify-between items-center group">
                                           <div>
                                               <div className="font-bold text-slate-800">{s.specificSymptom}</div>
                                               <div className="text-xs text-slate-500 mt-1">
                                                   程度: {s.severity}/5 | 持续: {s.duration}
                                               </div>
                                           </div>
                                           <button 
                                               onClick={() => setSymptomLog(symptomLog.filter((_, idx) => idx !== i))}
                                               className="text-slate-300 hover:text-red-500 p-2"
                                           >
                                               <X className="w-4 h-4" />
                                           </button>
                                       </div>
                                   ))}
                                   
                                   {likelySideEffects.length > 0 && (
                                       <div className="mt-8 pt-8 border-t border-slate-100">
                                           <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">当前治疗常见副作用 (快速添加)</h5>
                                           <div className="flex flex-wrap gap-2">
                                               {likelySideEffects.slice(0, 5).map(se => (
                                                   <button 
                                                       key={se.id}
                                                       onClick={() => toggleQuickSymptom(se.name)}
                                                       className={clsx(
                                                           "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                                                           symptomLog.some(s => s.specificSymptom === se.name) 
                                                               ? "bg-indigo-50 border-indigo-200 text-indigo-700" 
                                                               : "bg-white border-slate-200 text-slate-600 hover:border-indigo-300"
                                                       )}
                                                   >
                                                       {se.name}
                                                   </button>
                                               ))}
                                           </div>
                                       </div>
                                   )}
                               </div>
                           )}
                       </div>
                   </div>
                   
                   {activeBodyPart && (
                        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
                                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                    <h4 className="font-bold text-slate-800">记录症状 - {activeBodyPart}</h4>
                                    <button onClick={() => setActiveBodyPart(null)} className="p-1 rounded-full hover:bg-slate-200"><X className="w-5 h-5 text-slate-500"/></button>
                                </div>
                                <div className="p-6 space-y-6">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">具体症状</label>
                                        <div className="flex flex-wrap gap-2">
                                            {modalSymptoms.map(sym => (
                                                <button 
                                                    key={sym}
                                                    onClick={() => setSelectedSymptom(sym)}
                                                    className={clsx(
                                                        "px-3 py-2 rounded-lg text-sm border transition-all",
                                                        selectedSymptom === sym ? "bg-indigo-600 text-white border-indigo-600 font-bold" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                                    )}
                                                >
                                                    {sym}
                                                </button>
                                            ))}
                                            <button 
                                                onClick={() => setSelectedSymptom('OTHER')}
                                                className={clsx(
                                                    "px-3 py-2 rounded-lg text-sm border transition-all",
                                                    selectedSymptom === 'OTHER' ? "bg-indigo-600 text-white border-indigo-600 font-bold" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                                )}
                                            >
                                                其他...
                                            </button>
                                        </div>
                                        {selectedSymptom === 'OTHER' && (
                                            <input 
                                                type="text" 
                                                className="mt-3 w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                                placeholder="请输入症状描述"
                                                value={customSymptomText}
                                                onChange={e => setCustomSymptomText(e.target.value)}
                                            />
                                        )}
                                    </div>

                                    {selectedSymptom && (
                                        <>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2 flex justify-between">
                                                    <span>严重程度 (CTCAE 参考)</span>
                                                    <span className="text-indigo-600">{symptomSeverity} 级</span>
                                                </label>
                                                <input 
                                                    type="range" min="1" max="5" step="1"
                                                    value={symptomSeverity}
                                                    onChange={e => setSymptomSeverity(Number(e.target.value))}
                                                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                />
                                                <p className="text-xs text-slate-500 mt-2 bg-slate-50 p-2 rounded border border-slate-100 leading-relaxed">
                                                    {getCurrentGradeDescription}
                                                </p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-2">持续时间</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {DURATION_OPTIONS.map(opt => (
                                                        <button 
                                                            key={opt}
                                                            onClick={() => setSymptomDuration(opt)}
                                                            className={clsx(
                                                                "px-3 py-1.5 rounded-lg text-xs border transition-all",
                                                                symptomDuration === opt ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-200 text-slate-600"
                                                            )}
                                                        >
                                                            {opt}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    <button 
                                        onClick={confirmSymptom}
                                        disabled={!selectedSymptom || (selectedSymptom === 'OTHER' && !customSymptomText)}
                                        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-100"
                                    >
                                        确认记录
                                    </button>
                                </div>
                            </div>
                        </div>
                   )}
               </div>
           )}

           {isCheckedInToday && checkInStep === 'RESULT' && (
               <div className="p-8">
                   <div className="flex items-center gap-4 mb-8 bg-green-50 p-4 rounded-xl border border-green-100">
                       <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                           <CheckCircle className="w-5 h-5 text-green-600" />
                       </div>
                       <div className="flex-1">
                           <h3 className="font-bold text-green-800">今日健康打卡已完成</h3>
                           <p className="text-sm text-green-700">AI 已根据您的反馈生成 {adviceList.length} 条个性化护理建议</p>
                       </div>
                       <button onClick={() => { setIsCheckedInToday(false); setCheckInStep('INTRO'); }} className="text-xs font-bold text-green-700 bg-white px-3 py-1.5 rounded-lg border border-green-200 hover:bg-green-100">
                           修改记录
                       </button>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       {adviceList.map((advice, idx) => (
                           <div key={idx} className={clsx("p-6 rounded-2xl border shadow-sm transition-all hover:shadow-md", 
                               advice.severityLevel === 'Severe' ? "bg-red-50 border-red-100" :
                               advice.severityLevel === 'Moderate' ? "bg-orange-50 border-orange-100" :
                               advice.isComforting ? "bg-indigo-50 border-indigo-100" : "bg-white border-slate-100"
                           )}>
                               <div className="flex items-center gap-3 mb-3">
                                   <div className={clsx("p-2 rounded-lg",
                                       advice.category === 'Nutrition' ? "bg-green-100 text-green-600" :
                                       advice.category === 'Psych' ? "bg-purple-100 text-purple-600" :
                                       advice.severityLevel === 'Severe' ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                                   )}>
                                       {advice.category === 'Nutrition' ? <Utensils className="w-4 h-4"/> : 
                                        advice.category === 'Psych' ? <Heart className="w-4 h-4"/> : <ShieldCheck className="w-4 h-4"/>}
                                   </div>
                                   <h4 className="font-bold text-slate-800 flex-1">{advice.title}</h4>
                               </div>
                               <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{advice.content}</p>
                               <div className="mt-4 pt-3 border-t border-slate-100/50 flex justify-between items-center text-xs">
                                   <span className="text-slate-400">来源: {advice.source}</span>
                                   {advice.severityLevel === 'Severe' && (
                                       <span className="flex items-center gap-1 text-red-600 font-bold bg-red-100 px-2 py-0.5 rounded">
                                           <Siren className="w-3 h-3" /> 建议就医
                                       </span>
                                   )}
                               </div>
                           </div>
                       ))}
                       {adviceList.length === 0 && (
                           <div className="col-span-full text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                               <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                               <p>今日状态极佳，暂无特殊护理建议。继续保持！</p>
                           </div>
                       )}
                   </div>
               </div>
           )}
        </div>
      </div>
    );
  };

  if (activeSection === 'medical-records') return <MedicalRecordModule />;
  if (activeSection === 'ukb-profile') return <UKBRiskProfileView />; // New View
  return <CareCenterView />;
};

export default PatientDashboard;