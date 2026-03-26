import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, SkipForward, Volume2, VolumeX, Music } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/api';

export const BGMPlayer: React.FC = () => {
  const { bgm, toggleBgm, setBgmVolume, nextTrack } = useAppStore();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const prevVolume = useRef(bgm.volume);

  useEffect(() => {
    if (!audioRef.current) return;
    if (bgm.isPlaying) {
      audioRef.current.play().catch(err => console.warn('Autoplay blocked:', err));
    } else {
      audioRef.current.pause();
    }
  }, [bgm.isPlaying, bgm.currentTrack]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = bgm.volume;
    }
  }, [bgm.volume]);

  const handleToggleMute = () => {
    if (isMuted) {
      setBgmVolume(prevVolume.current);
    } else {
      prevVolume.current = bgm.volume;
      setBgmVolume(0);
    }
    setIsMuted(!isMuted);
  };

  if (bgm.tracks.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 p-3 bg-reflect-sidebar/40 rounded-xl border border-reflect-border/30 backdrop-blur-sm">
      <audio
        ref={audioRef}
        src={bgm.currentTrack ? api.getBgmStreamUrl(bgm.currentTrack) : undefined}
        onEnded={nextTrack}
        loop={bgm.tracks.length === 1}
      />
      
      <div className="flex items-center gap-2 overflow-hidden">
        <div className="p-2 bg-reflect-text/10 rounded-lg text-reflect-text">
          <Music size={14} className={bgm.isPlaying ? 'animate-pulse' : ''} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-reflect-text truncate">
            {bgm.currentTrack || '未播放'}
          </p>
          <p className="text-[9px] text-reflect-muted uppercase tracking-wider font-semibold">
            Background Music
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="flex items-center gap-1">
          <button
            onClick={toggleBgm}
            className="p-1.5 hover:bg-reflect-text/10 rounded-lg transition-colors text-reflect-text"
          >
            {bgm.isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
          </button>
          <button
            onClick={nextTrack}
            className="p-1.5 hover:bg-reflect-text/10 rounded-lg transition-colors text-reflect-text"
          >
            <SkipForward size={14} fill="currentColor" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-1 max-w-[80px]">
          <button onClick={handleToggleMute} className="text-reflect-muted hover:text-reflect-text transition-colors">
            {bgm.volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={bgm.volume}
            onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
            className="flex-1 h-1 bg-reflect-text/20 rounded-lg appearance-none cursor-pointer accent-reflect-text"
          />
        </div>
      </div>
    </div>
  );
};
