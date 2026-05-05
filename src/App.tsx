
import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { 
  Upload, FileText, Loader2, CheckCircle2, 
  ChevronDown, Download, Sparkles, BookOpen,
  FileSpreadsheet, Printer, LogIn, LogOut, 
  Clock, BrainCircuit, RefreshCw, AlertCircle,
  X, ChevronRight, Brain
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { AnalysisResult, Question, generateBilingualNotes, generatePracticePaper } from './services/analysisService';

// Firebase
import { auth, db, signInWithGoogle, signInWithGoogleRedirect } from './lib/firebase';
import { onAuthStateChanged, User, signOut, getRedirectResult } from 'firebase/auth';
import { 
  doc, setDoc, getDoc, updateDoc, onSnapshot, serverTimestamp 
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/firestoreUtils';

// Export Libraries
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as ExcelJS from 'exceljs';
import * as docx from 'docx';
import { saveAs } from 'file-saver';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  
  // Progress messages for analysis
  const progressMessages = [
    "Uploading research document...",
    "Scanning content structure...",
    "Extracting academic concepts...",
    "Categorizing question patterns...",
    "Analyzing topic distribution...",
    "Generating intelligence summary...",
    "Finalizing report..."
  ];
  const [progressIndex, setProgressIndex] = useState(0);

  // Rotate progress messages
  useEffect(() => {
    let interval: any;
    if (loading) {
      interval = setInterval(() => {
        setProgressIndex(prev => (prev + 1) % progressMessages.length);
      }, 2500);
    } else {
      setProgressIndex(0);
    }
    return () => clearInterval(interval);
  }, [loading]);
  
  // States for Features
  const [generatingNotes, setGeneratingNotes] = useState<string | null>(null);
  const [notes, setNotes] = useState<{ [key: string]: string }>({});
  const [generatingPractice, setGeneratingPractice] = useState(false);
  const [practicePaper, setPracticePaper] = useState<Question[] | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showRedirectOption, setShowRedirectOption] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth Listener
  useEffect(() => {
    // Check for redirect result on mount
    getRedirectResult(auth).catch((err) => {
      console.error("Redirect auth error:", err);
    });

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        console.log("User logged in:", u.uid, u.email);
        // Sync user profile
        try {
          const userRef = doc(db, 'users', u.uid);
          let userSnap;
          try {
            userSnap = await getDoc(userRef);
          } catch (err: any) {
             handleFirestoreError(err, OperationType.GET, `users/${u.uid}`);
             return;
          }
          
          if (!userSnap?.exists()) {
            console.log("Creating new user profile...");
            await setDoc(userRef, {
              displayName: u.displayName || null,
              email: u.email || "",
              photoURL: u.photoURL || null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          } else {
            console.log("Updating existing user profile...");
            await updateDoc(userRef, {
              displayName: u.displayName || null,
              email: u.email || "",
              photoURL: u.photoURL || null,
              updatedAt: serverTimestamp()
            });
          }
        } catch (e: any) {
          console.warn("Profile sync failed:", e.message);
        }
      } else {
        // Full reset on logout
        reset();
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      // Wiping all uploaded analyses from cloud to respect session privacy
      // We DO NOT delete the user profile (user info)
      if (user) {
        const { deleteDoc, getDocs, collection } = await import('firebase/firestore');
        
        // Delete all analyses for this user (the "uploads")
        const analysesRef = collection(db, 'users', user.uid, 'analyses');
        try {
          const snapshot = await getDocs(analysesRef);
          const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
          await Promise.all(deletePromises);
          console.log("All session uploads cleared from cloud.");
        } catch (err) {
          console.warn("Could not delete some uploads (maybe already gone)", err);
        }
      }
      
      await signOut(auth);
      resetStateOnly(); // Clear local state only
    } catch (err) {
      console.error("Logout failed", err);
      await signOut(auth).catch(() => {});
      resetStateOnly();
    }
  };

  const resetStateOnly = () => {
    setFile(null);
    setResult(null);
    setError(null);
    setPracticePaper(null);
    setNotes({});
    setCurrentSessionId(null);
  };

  const reset = async () => {
    // Attempt background cleanup of current session if possible
    if (user && currentSessionId) {
      const { deleteDoc } = await import('firebase/firestore');
      deleteDoc(doc(db, 'users', user.uid, 'analyses', currentSessionId)).catch(() => {});
    }
    resetStateOnly();
  };

  const handleSignIn = async () => {
    try {
      setError(null);
      setShowRedirectOption(false);
      await signInWithGoogle();
    } catch (err: any) {
      console.error("Sign in error:", err);
      if (err.code === 'auth/popup-blocked') {
        setError("Login popup blocked. Please use the 'Try Redirect Login' button below.");
        setShowRedirectOption(true);
      } else if (err.code === 'auth/unauthorized-domain') {
        const domains = [
          window.location.hostname,
          "ais-dev-is4twyz67di5unbkghkqsd-56058003685.asia-southeast1.run.app",
          "ais-pre-is4twyz67di5unbkghkqsd-56058003685.asia-southeast1.run.app"
        ];
        setError(`Unauthorized Domain. Please add these domains to your Firebase Console (Authentication > Settings > Authorized domains): ${domains.join(', ')}`);
      } else {
        setError(err.message || "Failed to sign in. Please try again.");
      }
    }
  };

  const handleSignInRedirect = async () => {
    try {
      setError(null);
      await signInWithGoogleRedirect();
    } catch (err: any) {
      console.error("Redirect sign in error:", err);
      setError(err.message || "Redirect login failed.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !user) {
      if (!user) setError("Please log in to analyze papers.");
      return;
    }

    setLoading(true);
    setError(null);
    const sessionId = crypto.randomUUID();
    setCurrentSessionId(sessionId);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        
        // Call Backend API
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileData: base64Data,
            mimeType: file.type,
            userId: user.uid,
            sessionId: sessionId
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Analysis failed");
        }

        const resData = await response.json();
        
        if (resData.status === 'completed') {
          const analysisData = resData.data;
          
          // Save to Firestore FROM CLIENT side to avoid admin SDK issues
          try {
            const analysisPath = `users/${user.uid}/analyses/${sessionId}`;
            await setDoc(doc(db, 'users', user.uid, 'analyses', sessionId), {
              ...analysisData,
              createdAt: serverTimestamp(), // Ensure server timestamp for rules
              status: 'completed',
              updatedAt: serverTimestamp()
            });
            console.log("Analysis saved to cloud by client.");
          } catch (dbErr) {
            handleFirestoreError(dbErr, OperationType.WRITE, `users/${user.uid}/analyses/${sessionId}`);
          }

          const resultObj = {
            ...analysisData,
            topics: JSON.parse(analysisData.topicsJson || '[]')
          } as AnalysisResult;
          
          setResult(resultObj);
          setLoading(false);
        } else {
          throw new Error("Unexpected response from server");
        }
      };
    } catch (err) {
      console.error(err);
      setError("Failed to process file.");
      setLoading(false);
    }
  };

  const handleGenerateNotes = async (topic: string) => {
    if (!result) return;
    setGeneratingNotes(topic);
    setNotes(prev => ({ ...prev, [topic]: "" })); // Reset/Init notes for this topic
    
    try {
      await generateBilingualNotes(topic, result.subject, (chunk) => {
        setNotes(prev => ({ ...prev, [topic]: (prev[topic] || "") + chunk }));
      });
    } catch (err) {
      console.error(err);
      setError("Failed to generate notes. Please try again.");
    } finally {
      setGeneratingNotes(null);
    }
  };

  const handleGeneratePractice = async () => {
    if (!result) return;
    setGeneratingPractice(true);
    try {
      const paper = await generatePracticePaper(result);
      setPracticePaper(paper.questions);
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingPractice(false);
    }
  };

  // Export Logic
  const exportToPDF = () => {
    if (!result) return;
    const doc = new jsPDF() as any;
    doc.text(`Analysis: ${result.subject}`, 10, 10);
    const rows = result.topics.flatMap(t => t.questions.map(q => [t.name, q.text, q.difficulty || 'N/A']));
    doc.autoTable({ head: [['Topic', 'Question', 'Difficulty']], body: rows, startY: 20 });
    doc.save(`${result.subject}_analysis.pdf`);
  };

  const exportToExcel = async () => {
    if (!result) return;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Analysis');
    worksheet.columns = [{ header: 'Topic', key: 'topic', width: 25 }, { header: 'Question', key: 'question', width: 50 }, { header: 'Difficulty', key: 'difficulty', width: 15 }];
    result.topics.forEach(t => t.questions.forEach(q => worksheet.addRow({ topic: t.name, question: q.text, difficulty: q.difficulty || 'N/A' })));
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${result.subject}_analysis.xlsx`);
  };

  const exportToDOCX = async (isPractice = false) => {
    const data = isPractice ? { subject: result?.subject, items: practicePaper } : { subject: result?.subject, topics: result?.topics };
    if (!data.subject) return;
    const sections = [];
    if (isPractice && practicePaper) {
       sections.push({ properties: {}, children: [new docx.Paragraph({ text: `Practice Paper: ${data.subject}`, heading: docx.HeadingLevel.HEADING_1 }), ...practicePaper.map((q, i) => new docx.Paragraph({ text: `${i+1}. ${q.text} [${q.difficulty}]`, spacing: { before: 200 } }))] });
    } else if (result?.topics) {
      sections.push({ properties: {}, children: [new docx.Paragraph({ text: `Analysis: ${data.subject}`, heading: docx.HeadingLevel.HEADING_1 }), ...result.topics.flatMap(t => [new docx.Paragraph({ text: t.name, heading: docx.HeadingLevel.HEADING_2, spacing: { before: 400 } }), ...t.questions.map(q => new docx.Paragraph({ text: `• ${q.text} (${q.difficulty})`, spacing: { before: 100 } }))])] });
    }
    const docObj = new docx.Document({ sections });
    const blob = await docx.Packer.toBlob(docObj);
    saveAs(blob, `${data.subject}_${isPractice ? 'practice' : 'analysis'}.docx`);
  };

  return (
    <div className="min-h-screen selection:bg-nothing-black selection:text-white pb-20">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 p-6 flex justify-between items-center pointer-events-none">
        <div className="pointer-events-auto">
          <button onClick={reset} className="text-2xl font-display font-bold tracking-[0.3em] uppercase hover:opacity-70 transition-opacity">
            NOTHING
          </button>
        </div>
        <div className="pointer-events-auto flex items-center gap-4">
           {user ? (
              <div className="flex items-center gap-3 bg-white/80 backdrop-blur p-1 pr-4 rounded-full border border-nothing-black/5 shadow-sm">
                <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-nothing-black/5" />
                <span className="text-[10px] uppercase font-bold tracking-widest text-nothing-gray">
                  {user.displayName?.split(' ')[0]}
                </span>
                <div className="h-4 w-[1px] bg-nothing-black/10"></div>
                <button onClick={handleLogout} className="text-[10px] uppercase font-bold tracking-widest hover:text-red-500 transition-colors">
                  Logout
                </button>
              </div>
           ) : (
             <button onClick={handleSignIn} className="px-6 py-2 bg-nothing-black text-white rounded-full flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest hover:bg-nothing-black/80 transition-all">
               <LogIn size={14} /> Login with Google
             </button>
           )}
        </div>
      </nav>

      <main className="container mx-auto px-6 pt-32 max-w-6xl">
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center text-center justify-center min-h-[70vh]"
            >
              <div className="mb-8 p-6 bg-nothing-black/5 rounded-full relative">
                <BrainCircuit size={48} className="text-nothing-black/20" />
                <div className="absolute -top-1 -right-1">
                  <span className="flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-nothing-accent opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-nothing-accent"></span>
                  </span>
                </div>
              </div>
              
              <h1 className="text-4xl md:text-7xl font-serif mb-6 tracking-tight leading-tight">
                Academic Intelligence <br/>
                <span className="text-nothing-gray italic opacity-40">Privacy-First Analysis</span>
              </h1>
              
              <div className="flex gap-4 mb-12 items-center justify-center bg-nothing-black/[0.03] p-1 px-4 rounded-full border border-nothing-black/5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-nothing-gray">
                   Status: {user ? 'Authenticated Session' : 'Guest Mode (Login Required)'}
                </span>
              </div>

              <div className="w-full max-w-md">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative group cursor-pointer border-2 border-dashed border-nothing-black/10 rounded-3xl p-16 transition-all hover:border-nothing-black/30 hover:bg-nothing-black/[0.02] ${file ? 'bg-nothing-black/[0.02] border-nothing-black/30 shadow-inner' : ''}`}
                >
                  <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="application/pdf,image/*" className="hidden" />
                  {file ? (
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-4 bg-nothing-black text-white rounded-2xl shadow-xl"><CheckCircle2 size={32} /></div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold truncate max-w-[240px]">{file.name}</span>
                        <span className="text-[10px] text-nothing-gray uppercase tracking-widest mt-1">Ready for Background Processing</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <div className="p-4 bg-nothing-black/5 rounded-2xl group-hover:bg-nothing-black transition-all group-hover:text-white group-hover:scale-110"><Upload size={32} /></div>
                      <div className="space-y-1">
                        <span className="text-sm font-bold block">Drop your paper here</span>
                        <span className="text-[10px] text-nothing-gray uppercase tracking-widest">PDF, PNG, or JPEG</span>
                      </div>
                    </div>
                  )}
                </div>

                <motion.button
                  whileHover={{ scale: user ? 1.02 : 1 }}
                  whileTap={{ scale: user ? 0.98 : 1 }}
                  disabled={!file || loading || !user}
                  onClick={handleUpload}
                  className={`mt-10 w-full py-5 rounded-2xl flex items-center justify-center gap-3 font-bold tracking-widest uppercase text-xs transition-all shadow-lg ${
                    file && !loading && user 
                      ? 'bg-nothing-black text-white shadow-nothing-black/20' 
                      : 'bg-nothing-black/10 text-nothing-black/30 cursor-not-allowed shadow-none'
                  }`}
                >
                  {loading ? (
                    <div className="flex flex-col items-center gap-3">
                       <div className="flex items-center gap-2">
                         <RefreshCw className="animate-spin" size={18} />
                         <span>Speed Optimized Analysis...</span>
                       </div>
                       <motion.span 
                         key={progressIndex}
                         initial={{ opacity: 0, y: 5 }}
                         animate={{ opacity: 1, y: 0 }}
                         className="text-[9px] font-medium opacity-50 lowercase tracking-widest"
                       >
                         {progressMessages[progressIndex]}
                       </motion.span>
                    </div>
                  ) : !user ? (
                     <span>Login to Start Analysis</span>
                  ) : (
                    <>
                       <Sparkles size={18}/>
                       <span>Analyze in Background</span>
                    </>
                  )}
                </motion.button>
                
                {error && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 p-4 bg-red-50 text-red-500 rounded-xl text-xs font-medium border border-red-100 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <AlertCircle size={14}/> {error}
                    </div>
                    {showRedirectOption && (
                      <button 
                        onClick={handleSignInRedirect}
                        className="mt-2 w-full py-3 bg-nothing-black text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"
                      >
                        Try Login with Redirect
                      </button>
                    )}
                  </motion.div>
                )}
                
                <p className="mt-8 text-[9px] uppercase tracking-[0.2em] text-nothing-gray/60 leading-relaxed">
                   Private Session: Results are processed in background but reset completely upon logout.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-16">
              <header className="border-b border-nothing-black/5 pb-12">
                 <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="h-[1px] w-8 bg-nothing-black/20"></div>
                      <h2 className="text-nothing-gray text-[10px] uppercase tracking-[0.4em] font-bold">Analysis Profile Created</h2>
                    </div>
                    <h1 className="text-5xl md:text-8xl font-serif tracking-tight leading-[0.95]">{result.subject}</h1>
                    
                    <div className="flex flex-wrap gap-4 mt-8">
                      {result.year && (
                        <div className="px-4 py-2 bg-nothing-black text-white rounded-xl flex flex-col justify-center">
                          <span className="text-[8px] uppercase tracking-widest opacity-60 mb-0.5">Session</span>
                          <span className="text-xs font-bold font-display">{result.year}</span>
                        </div>
                      )}
                      <div className="px-4 py-2 bg-nothing-black/[0.03] border border-nothing-black/5 rounded-xl flex flex-col justify-center">
                        <span className="text-[8px] uppercase tracking-widest text-nothing-gray mb-0.5">Total Qs</span>
                        <span className="text-xs font-bold font-display">{result.totalQuestions}</span>
                      </div>
                      <div className="px-4 py-2 bg-nothing-black/[0.03] border border-nothing-black/5 rounded-xl flex flex-col justify-center">
                        <span className="text-[8px] uppercase tracking-widest text-nothing-gray mb-0.5">Chapters</span>
                        <span className="text-xs font-bold font-display">{result.topics.length}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative">
                      <button onClick={() => setShowExportMenu(!showExportMenu)} className="w-full flex items-center justify-center gap-2 px-8 py-4 bg-nothing-black text-white rounded-2xl text-xs font-bold tracking-widest uppercase hover:bg-nothing-black/80 transition-all shadow-xl shadow-nothing-black/10">
                        <Download size={16} /> Export Analysis
                      </button>
                      <AnimatePresence>
                        {showExportMenu && (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute mt-2 right-0 left-0 sm:w-56 bg-white border border-nothing-black/5 shadow-2xl rounded-2xl overflow-hidden z-20">
                             <button onClick={exportToPDF} className="w-full p-4 text-left flex items-center gap-3 text-xs font-bold hover:bg-nothing-black/[0.02] transition-colors border-b border-nothing-black/5 text-red-500"><FileText size={14}/> PDF Document</button>
                             <button onClick={exportToExcel} className="w-full p-4 text-left flex items-center gap-3 text-xs font-bold hover:bg-nothing-black/[0.02] transition-colors border-b border-nothing-black/5 text-green-600"><FileSpreadsheet size={14}/> Excel Spreadsheet</button>
                             <button onClick={() => exportToDOCX(false)} className="w-full p-4 text-left flex items-center gap-3 text-xs font-bold hover:bg-nothing-black/[0.02] transition-colors border-b border-nothing-black/5 text-blue-600"><FileText size={14}/> Word (.docx)</button>
                             <button onClick={() => window.print()} className="w-full p-4 text-left flex items-center gap-3 text-xs font-bold hover:bg-nothing-black/[0.02] transition-colors"><Printer size={14}/> HTML / Print</button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
                {result.summary && (
                  <div className="mt-14 relative p-10 bg-nothing-black/[0.02] border border-nothing-black/5 rounded-[40px]">
                    <div className="absolute -top-4 left-10 px-4 py-1 bg-nothing-black text-white rounded-full text-[10px] font-bold uppercase tracking-widest">AI Intelligence Summary</div>
                    <p className="text-2xl md:text-3xl font-serif leading-relaxed text-nothing-black/80 italic">{result.summary}</p>
                  </div>
                )}
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                <div className="lg:col-span-8">
                  <div className="flex items-center justify-between mb-8">
                     <h3 className="text-2xl font-serif tracking-tight">Question Catalog</h3>
                     <span className="text-[10px] uppercase font-bold text-nothing-gray tracking-widest">{result.totalQuestions} Items Analyzed</span>
                  </div>
                  <div className="space-y-8">
                    {result.topics.map((topic, topicIdx) => (
                      <div key={topicIdx} className="group">
                        <div className="p-8 bg-white border border-nothing-black/5 rounded-[32px] shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => setExpandedTopic(expandedTopic === topic.name ? null : topic.name)}>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-5">
                               <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-nothing-black text-white font-display font-medium text-xl shadow-lg">{topicIdx + 1}</div>
                               <div><h4 className="text-xl font-bold tracking-tight">{topic.name}</h4><p className="text-xs text-nothing-gray mt-1 uppercase tracking-widest font-medium">{topic.questions.length} Items</p></div>
                            </div>
                            <ChevronDown className={`transition-transform duration-500 text-nothing-gray ${expandedTopic === topic.name ? 'rotate-180' : ''}`} size={24} />
                          </div>
                          <AnimatePresence>
                            {expandedTopic === topic.name && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="pt-6 space-y-4">
                                  {topic.questions.map((q, qIdx) => (
                                    <div key={qIdx} className="p-6 bg-nothing-black/[0.02] rounded-2xl border border-nothing-black/5">
                                      <div className="flex items-center gap-3 mb-3">
                                         <span className="text-[10px] font-black opacity-20">0{qIdx + 1}</span>
                                         {q.difficulty && <span className={`text-[8px] font-bold px-3 py-1 rounded-full uppercase tracking-tighter ${q.difficulty === 'Easy' ? 'bg-green-100 text-green-700' : q.difficulty === 'Medium' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>{q.difficulty}</span>}
                                      </div>
                                      <p className="text-base text-nothing-black/80 leading-relaxed italic font-serif">"{q.text}"</p>
                                    </div>
                                  ))}
                                  <div className="mt-8 pt-8 border-t border-nothing-black/10">
                                     <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-3"><BookOpen size={20} className="text-nothing-accent"/><h5 className="text-sm font-bold uppercase tracking-widest">Bilingual Notes Explainer</h5></div>
                                        {!notes[topic.name] ? (
                                           <button onClick={(e) => { e.stopPropagation(); handleGenerateNotes(topic.name); }} disabled={!!generatingNotes} className="flex items-center gap-2 px-6 py-2.5 bg-black text-white rounded-full text-[10px] font-bold uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50">
                                             {generatingNotes === topic.name ? <RefreshCw size={12} className="animate-spin"/> : <Sparkles size={12} />} Generate Bilingual Notes
                                           </button>
                                        ) : <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest flex items-center gap-2"><CheckCircle2 size={12}/> Notes Ready</span>}
                                     </div>
                                     {notes[topic.name] && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 p-8 bg-nothing-black/[0.04] rounded-3xl prose prose-sm max-w-none prose-stone"><ReactMarkdown>{notes[topic.name]}</ReactMarkdown></motion.div>}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-10">
                  <div className="p-10 bg-nothing-black rounded-[40px] text-white shadow-2xl relative overflow-hidden">
                    <div className="absolute -right-10 -top-10 w-40 h-40 bg-nothing-accent/20 blur-[60px] rounded-full"></div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-6 opacity-60"><Brain size={20}/><span className="text-[10px] font-bold uppercase tracking-[0.3em]">Smart Generator</span></div>
                      <h3 className="text-3xl font-serif mb-6 leading-tight">Create a custom <br/> Practice Paper</h3>
                      <p className="text-sm text-white/60 mb-10 leading-relaxed font-light">Generates a fresh paper with same difficulty pattern but updated content.</p>
                      {!practicePaper && (
                        <button onClick={handleGeneratePractice} disabled={generatingPractice} className="w-full py-4 bg-white text-nothing-black rounded-2xl flex items-center justify-center gap-3 text-xs font-bold tracking-widest uppercase hover:bg-white/90 transition-all active:scale-95 disabled:opacity-50">
                          {generatingPractice ? <RefreshCw className="animate-spin" size={16}/> : <Sparkles size={16}/>} {generatingPractice ? 'Generating...' : 'Generate New Paper'}
                        </button>
                      )}
                      {practicePaper && (
                        <div className="space-y-3">
                           <div className="flex items-center gap-2 text-green-400 mb-6 font-bold text-xs"><CheckCircle2 size={16}/> Ready for Export</div>
                           <button onClick={() => exportToDOCX(true)} className="w-full py-4 bg-nothing-accent text-white rounded-2xl flex items-center justify-center gap-3 text-xs font-bold tracking-widest uppercase hover:opacity-90 shadow-xl"><Download size={16}/> Download DOCX</button>
                           <button onClick={() => setPracticePaper(null)} className="w-full py-3 border border-white/20 rounded-2xl flex items-center justify-center gap-3 text-[10px] font-bold tracking-widest uppercase hover:bg-white/5 transition-all">Discard</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-10 bg-white border border-nothing-black/5 rounded-[40px] shadow-sm">
                    <h3 className="text-[10px] uppercase tracking-widest font-bold text-nothing-gray mb-8">Concept Weightage</h3>
                    <div className="space-y-6">
                      {result.topics.map((t, i) => {
                         const percentage = (t.questions.length / result.totalQuestions) * 100;
                         return (
                           <div key={i} className="space-y-2">
                             <div className="flex justify-between text-xs font-bold"><span>{t.name}</span><span className="opacity-40">{Math.round(percentage)}%</span></div>
                             <div className="h-1.5 w-full bg-nothing-black/5 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${percentage}%` }} transition={{ duration: 1 }} className="h-full bg-nothing-black"></motion.div></div>
                           </div>
                         );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="py-20 border-t border-nothing-black/5 mt-20">
        <div className="container mx-auto px-6 text-center space-y-6 opacity-30">
          <p className="text-[10px] uppercase tracking-[0.4em] font-bold">Cloud Persistent Infrastructure Enabled</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
