import { Database, Settings2, Folder, RefreshCw, Terminal, CheckCircle2, AlertTriangle, ShieldCheck, Image as ImageIcon, Upload, Palette, Trash2, Check } from 'lucide-react';
import { useEffect, useState, useRef, ChangeEvent } from 'react';
import type { ModelConfig } from '../lib/types';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { wallpaperStore } from '../lib/wallpaperStore';

type SettingsPanelProps = {
  modelConfig: ModelConfig;
  onUpdateModelConfig: (payload: ModelConfig) => Promise<void>;
};

export function SettingsPanel({ modelConfig, onUpdateModelConfig }: SettingsPanelProps) {
  const { userStats, updateUserWallpaper, updateUserTheme } = useAppStore();
  const [config, setConfig] = useState(modelConfig);
  const [dataPath, setDataPath] = useState('');
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('access_token') || '');
  const [logs, setLogs] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'pending' | 'updating' | 'success' | 'error'>('idle');
  const [updateOutput, setUpdateOutput] = useState('');
  const [isUploadingWallpaper, setIsUploadingWallpaper] = useState(false);
  const [savedWallpapers, setSavedWallpapers] = useState<any[]>([]);
  const [wallpaperPreviews, setWallpaperPreviews] = useState<Record<string, string>>({});
  const logContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const themes = [
    { id: 'default', name: '默认 (Reflect)', color: 'bg-[#fcfbf9]' },
    { id: 'dark', name: '深色模式', color: 'bg-[#1a1a1a]' },
  ];

  // 加载已保存壁纸列表
  const loadWallpapers = async () => {
    try {
      const list = await wallpaperStore.listWallpapers();
      setSavedWallpapers(list);
      
      // 生成预览
      const previews: Record<string, string> = {};
      for (const wp of list) {
        const result = await wallpaperStore.resolveIdbUrl(`idb://${wp.id}`);
        if (result) {
          previews[wp.id] = typeof result === 'object' ? result.url : result;
        }
      }
      setWallpaperPreviews(previews);
    } catch (e) {
      console.error('Failed to load wallpapers', e);
    }
  };

  useEffect(() => {
    loadWallpapers();
  }, []);

  useEffect(() => {
    setConfig(modelConfig);
  }, [modelConfig]);

  // 定期拉取日志
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await api.getSystemLogs();
        if (res.logs.length > 0) {
          setLogs(prev => [...prev, ...res.logs].slice(-500));
        }
      } catch (e) {
        console.error('Failed to fetch logs', e);
      }
    };
    const timer = setInterval(fetchLogs, 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCheck = async () => {
    setIsUpdating(true);
    setUpdateStatus('checking');
    setUpdateOutput('');
    try {
      const res = await api.checkUpdate();
      setUpdateOutput(res.output);
      setUpdateStatus(res.status as any);
    } catch (e: any) {
      setUpdateOutput(e.message);
      setUpdateStatus('error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePerformUpdate = async () => {
    setIsUpdating(true);
    setUpdateStatus('updating');
    try {
      const res = await api.performUpdate();
      setUpdateOutput(res.output);
      setUpdateStatus(res.status === 'ok' ? 'success' : 'error');
    } catch (e: any) {
      setUpdateOutput(e.message);
      setUpdateStatus('error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRestart = async () => {
    try {
      await api.restartApp();
      alert('应用正在通过 fast_update.bat 重启并更新，请稍候...');
    } catch (e: any) {
      alert('重启失败: ' + e.message);
    }
  };

  const handleSwitchDataPath = async () => {
    if (!dataPath) return;
    try {
      const res = await api.switchDataPath(dataPath);
      alert(res.message);
    } catch (e: any) {
      alert('切换路径失败: ' + e.message);
    }
  };

  const handleUpdateAccessToken = () => {
    localStorage.setItem('access_token', accessToken);
    alert('本地访问密钥已更新。请确保它与后端配置一致。');
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    window.dispatchEvent(new CustomEvent('unauthorized'));
  };

  const handleWallpaperChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingWallpaper(true);
    try {
      const id = `wp-${Date.now()}`;
      const buffer = await file.arrayBuffer();
      const idbUrl = await wallpaperStore.setWallpaper(id, buffer, file.type, file.name);
      await updateUserWallpaper(idbUrl);
      await loadWallpapers();
    } catch (err: any) {
      alert('壁纸上传失败: ' + err.message);
    } finally {
      setIsUploadingWallpaper(false);
    }
  };

  const clearWallpaper = async () => {
    await updateUserWallpaper('');
  };

  const deleteWallpaper = async (id: string) => {
    if (!confirm('确定要删除这张壁纸吗？')) return;
    try {
      await wallpaperStore.deleteWallpaper(id);
      if (userStats?.wallpaper_url === `idb://${id}`) {
        await updateUserWallpaper('');
      }
      await loadWallpapers();
    } catch (e: any) {
      alert('删除失败: ' + e.message);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-[28px] border border-white/50 bg-[rgba(255,252,247,0.88)] p-6 shadow-soft backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-2xl bg-stone-900 p-3 text-white"><Settings2 size={18} /></div>
          <div>
            <div className="text-lg font-medium text-stone-900">设置</div>
            <div className="text-sm text-stone-500">在这里统一管理模型、导入和工作区设置。</div>
          </div>
        </div>
        
        <div className="grid gap-6 xl:grid-cols-2">
          {/* 模型设置 */}
          <div className="rounded-[24px] bg-white/85 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-500"><Database size={16} /> 模型设置</div>
            <div className="space-y-3">
              <input value={config.provider} onChange={(e) => setConfig({ ...config, provider: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="服务商" />
              <input value={config.model_name} onChange={(e) => setConfig({ ...config, model_name: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="模型名称" />
              <input value={config.base_url} onChange={(e) => setConfig({ ...config, base_url: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="接口地址 (需包含 /v1)" />
              <input value={config.api_key} onChange={(e) => setConfig({ ...config, api_key: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="API Key" />
              <button onClick={() => onUpdateModelConfig(config)} className="w-full rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white hover:bg-stone-800 transition-colors">保存设置</button>
            </div>
          </div>

          {/* 外观与主题 */}
          <div className="rounded-[24px] bg-white/85 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-500"><Palette size={16} /> 主题与外观</div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => updateUserTheme(t.id)}
                    className={`flex items-center gap-3 rounded-2xl border p-3 transition-all ${
                      userStats?.current_theme === t.id
                        ? 'border-stone-900 bg-stone-50 ring-1 ring-stone-900'
                        : 'border-stone-100 hover:border-stone-300'
                    }`}
                  >
                    <div className={`h-4 w-4 rounded-full ${t.color}`} />
                    <span className="text-xs font-medium text-stone-700">{t.name}</span>
                  </button>
                ))}
              </div>
              
              <div className="h-px bg-stone-100 my-2" />
              
              <div className="space-y-3">
                <div className="text-xs text-stone-400 mb-1 flex items-center gap-2">
                  <ImageIcon size={14} /> 壁纸库 (Gallery)
                </div>
                
                {savedWallpapers.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {savedWallpapers.map((wp) => (
                      <div key={wp.id} className="group relative aspect-video rounded-xl overflow-hidden border border-stone-100 hover:border-stone-300 transition-all">
                        {wp.type.startsWith('video') ? (
                          <video src={wallpaperPreviews[wp.id]} className="w-full h-full object-cover" />
                        ) : (
                          <img src={wallpaperPreviews[wp.id]} className="w-full h-full object-cover" />
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button 
                            onClick={() => updateUserWallpaper(`idb://${wp.id}`)}
                            className="p-1.5 bg-white rounded-full text-stone-900 hover:scale-110 transition-transform"
                            title="应用"
                          >
                            <Check size={14} />
                          </button>
                          <button 
                            onClick={() => deleteWallpaper(wp.id)}
                            className="p-1.5 bg-white rounded-full text-rose-600 hover:scale-110 transition-transform"
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {userStats?.wallpaper_url === `idb://${wp.id}` && (
                          <div className="absolute top-1 right-1 bg-stone-900 text-white rounded-full p-0.5">
                            <Check size={8} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleWallpaperChange} 
                  className="hidden" 
                  accept="image/*,video/*"
                />
                <div className="flex gap-2">
                  <button 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={isUploadingWallpaper}
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white hover:bg-stone-800 transition-colors disabled:opacity-50"
                  >
                    <Upload size={14} />
                    {isUploadingWallpaper ? '上传中...' : '上传壁纸'}
                  </button>
                  {userStats?.wallpaper_url && (
                    <button 
                      onClick={clearWallpaper}
                      className="rounded-2xl border border-rose-200 px-4 py-3 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      清除当前壁纸
                    </button>
                  )}
                </div>
                <div className="text-[11px] text-stone-400 leading-relaxed italic">
                  * 壁纸支持 MP4, WEBP, PNG。大视频将保存在本地。
                </div>
              </div>
            </div>
          </div>

          {/* 数据存储设置 */}
          <div className="rounded-[24px] bg-white/85 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-500"><Folder size={16} /> 数据存储</div>
            <div className="space-y-3">
              <div className="text-xs text-stone-400 mb-1">选择数据存储路径</div>
              <input 
                value={dataPath} 
                onChange={(e) => setDataPath(e.target.value)} 
                className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" 
                placeholder="例如: D:\SecondBrainData" 
              />
              <button 
                onClick={handleSwitchDataPath} 
                className="w-full rounded-2xl border border-stone-900 px-4 py-3 text-sm font-medium text-stone-900 hover:bg-stone-50 transition-colors"
              >
                应用
              </button>
              <div className="text-[11px] text-stone-400 leading-relaxed italic">
                * 切换成功后请重启软件生效。
              </div>
            </div>
          </div>

          {/* 访问密钥设置 */}
          <div className="rounded-[24px] bg-white/85 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-500"><ShieldCheck size={16} /> 访问控制</div>
            <div className="space-y-3">
              <div className="text-xs text-stone-400 mb-1">本地 Access Token</div>
              <input 
                type="password"
                value={accessToken} 
                onChange={(e) => setAccessToken(e.target.value)} 
                className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" 
                placeholder="输入密钥" 
              />
              <div className="flex gap-2">
                <button 
                  onClick={handleUpdateAccessToken} 
                  className="flex-1 rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white hover:bg-stone-800 transition-colors"
                >
                  更新密钥
                </button>
                <button 
                  onClick={handleLogout} 
                  className="rounded-2xl border border-rose-200 px-4 py-3 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  退出登录
                </button>
              </div>
              <div className="text-[11px] text-stone-400 leading-relaxed italic">
                * 修改此处仅更新浏览器存储的密钥，后端验证密钥需在 .env 或 backend/config.py 中配置。
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 系统日志与更新 */}
      <div className="rounded-[28px] border border-white/50 bg-[rgba(255,252,247,0.88)] p-6 shadow-soft backdrop-blur">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-stone-900 p-3 text-white"><Terminal size={18} /></div>
            <div>
              <div className="text-lg font-medium text-stone-900">系统日志与更新</div>
              <div className="text-sm text-stone-500">查看运行状态并获取最新功能。</div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={handleCheck} 
              disabled={isUpdating}
              className="flex items-center gap-2 rounded-2xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200 transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={isUpdating && updateStatus === 'checking' ? 'animate-spin' : ''} />
              {isUpdating && updateStatus === 'checking' ? '检查中...' : '检查更新'}
            </button>
            
            {/* 发现新版本 → 显示确认更新按钮 */}
            {updateStatus === 'pending' && (
              <button 
                onClick={handlePerformUpdate} 
                disabled={isUpdating}
                className="flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-all disabled:opacity-50"
              >
                <RefreshCw size={14} className={isUpdating ? 'animate-spin' : ''} />
                {isUpdating ? '更新中...' : '确认更新'}
              </button>
            )}
            
            {/* 更新成功 → 显示重启按钮 */}
            {updateStatus === 'success' && (
              <button 
                onClick={handleRestart} 
                className="flex items-center gap-2 rounded-2xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-all"
              >
                <CheckCircle2 size={14} />
                重启并应用
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {updateStatus !== 'idle' && updateOutput && (
            <div className={`rounded-2xl p-4 text-xs font-mono whitespace-pre-wrap ${
              updateStatus === 'error' ? 'bg-red-50 text-red-600' : 
              updateStatus === 'up-to-date' ? 'bg-green-50 text-green-700' :
              updateStatus === 'pending' ? 'bg-blue-50 text-blue-700' :
              'bg-stone-50 text-stone-600'
            }`}>
              <div className="mb-2 font-bold flex items-center gap-2">
                {updateStatus === 'error' ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                {updateStatus === 'up-to-date' ? '已是最新版本' : 
                 updateStatus === 'pending' ? '发现新版本' :
                 updateStatus === 'success' ? '更新成功' : 
                 updateStatus === 'error' ? '操作失败' : 'Update Result:'}
              </div>
              {updateOutput}
            </div>
          )}

          <div 
            ref={logContainerRef}
            className="h-64 overflow-y-auto rounded-[24px] bg-stone-900 p-4 font-mono text-xs text-stone-300 shadow-inner scroll-smooth"
          >
            <div className="space-y-1">
              {logs.map((log, i) => (
                <div key={i} className="opacity-90">{log}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
