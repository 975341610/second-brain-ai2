import React from 'react';
import type { UserAchievement } from '../lib/types';
import { useTheme } from './ThemeEngine';

interface AchievementWallProps {
  achievements: UserAchievement[];
}

export function AchievementWall({ achievements }: AchievementWallProps) {
  const { theme, setTheme } = useTheme();

  const themes = [
    { id: 'default', name: '默认白', color: 'bg-[#fcfbf9]' },
    { id: 'cyber', name: '赛博黑', color: 'bg-[#050505]' },
    { id: 'p5', name: '女神红', color: 'bg-[#d32f2f]' },
    { id: 'zelda', name: '海拉鲁', color: 'bg-[#00eeff]' },
  ];

  return (
    <div className="flex items-center gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      {/* 勋章插槽 */}
      <div className="flex -space-x-2">
        {achievements.length > 0 ? (
          achievements.slice(0, 5).map((ua) => (
            <div 
              key={ua.id} 
              className="w-8 h-8 rounded-full bg-white border-2 border-reflect-bg shadow-soft flex items-center justify-center text-lg hover:z-10 hover:scale-110 transition-transform cursor-help group relative"
              title={`${ua.achievement.name}: ${ua.achievement.description}`}
            >
              {ua.achievement.icon}
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-50">
                <div className="bg-reflect-text text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                  <span className="font-bold">{ua.achievement.name}</span>
                  <br />
                  <span className="opacity-80">{ua.achievement.description}</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="w-8 h-8 rounded-full bg-reflect-sidebar border-2 border-dashed border-reflect-border flex items-center justify-center text-[10px] text-reflect-muted italic">
            ?
          </div>
        )}
        {achievements.length > 5 && (
          <div className="w-8 h-8 rounded-full bg-reflect-sidebar border-2 border-reflect-bg shadow-soft flex items-center justify-center text-[10px] text-reflect-muted font-bold">
            +{achievements.length - 5}
          </div>
        )}
      </div>

      {/* 主题切换器 */}
      <div className="flex items-center gap-2 p-1 bg-reflect-sidebar/50 rounded-full border border-reflect-border/30">
        {themes.map((t) => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`w-5 h-5 rounded-full border-2 transition-all ${t.color} ${theme === t.id ? 'border-reflect-accent scale-110' : 'border-transparent hover:scale-105'}`}
            title={t.name}
          />
        ))}
      </div>
    </div>
  );
}
