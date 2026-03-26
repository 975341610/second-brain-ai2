import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import splashMain from '../assets/splash/main.webp';

export const SplashScreen: React.FC = () => {
  const { appStatus, loadInitialData } = useAppStore();
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (appStatus === 'READY') {
      const timer = setTimeout(() => setIsVisible(false), 500);
      return () => clearTimeout(timer);
    }
  }, [appStatus]);

  if (!isVisible) return null;

  const statusMap = {
    INIT: { text: '正在初始化...', progress: 10 },
    LOADING_BACKEND: { text: '正在连接后端服务...', progress: 30 },
    LOADING_FRONTEND: { text: '正在加载本地配置与数据...', progress: 70 },
    READY: { text: '准备就绪', progress: 100 },
    ERROR: { text: '初始化失败，请检查服务连接', progress: 0 },
  };

  const current = statusMap[appStatus];

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black transition-opacity duration-700 ${appStatus === 'READY' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img src={splashMain} alt="Splash Background" className="w-full h-full object-cover opacity-60 scale-105 blur-[2px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
      </div>

      <div className="relative z-10 max-w-md w-full px-8 text-center flex flex-col items-center">
        {/* Logo / Title Area */}
        <div className="mb-12 relative group">
          <div className="absolute -inset-4 bg-gradient-to-r from-reflect-text/20 to-reflect-sidebar/20 rounded-full blur-2xl group-hover:blur-3xl transition-all duration-700"></div>
          <div className="relative p-6 bg-white/10 border border-white/20 rounded-3xl backdrop-blur-2xl shadow-2xl transform hover:scale-105 transition-transform duration-500">
            <h1 className="text-4xl font-bold tracking-tighter text-white mb-1">
              SecondBrain<span className="text-white/60 font-light">AI</span>
            </h1>
            <p className="text-[10px] text-white/40 uppercase tracking-[0.3em] font-semibold">
              Powering your productivity
            </p>
          </div>
        </div>

        {/* Status / Loading Area */}
        {appStatus === 'ERROR' ? (
          <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl backdrop-blur-xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-3 text-rose-400 mb-4 justify-center font-medium">
              <AlertCircle size={20} />
              <span>{current.text}</span>
            </div>
            <button 
              onClick={() => void loadInitialData()}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-rose-600 text-white rounded-xl hover:bg-rose-700 active:scale-95 transition-all shadow-md font-medium"
            >
              <RefreshCw size={16} />
              重试加载
            </button>
          </div>
        ) : (
          <div className="w-full space-y-8 animate-in fade-in duration-1000">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="animate-spin text-white/40" size={32} />
              <div className="h-0.5 w-48 bg-white/10 rounded-full overflow-hidden relative">
                <div 
                  className="absolute inset-y-0 left-0 bg-white transition-all duration-1000 ease-in-out shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                  style={{ width: `${current.progress}%` }}
                />
              </div>
              <span className="text-xs font-medium text-white/60 tracking-wide">
                {current.text}
              </span>
            </div>
          </div>
        )}

        <div className="mt-20 text-[10px] text-white/20 font-mono tracking-widest uppercase">
          Build v0.5.4 • AI Augmented
        </div>
      </div>
    </div>
  );
};
