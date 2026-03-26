import React, { useState, useEffect } from 'react';
import { useSFX } from '../lib/useSFX';
import linkSprite from '../assets/sprites/link.webp';
import zeldaSprite from '../assets/sprites/zelda.webp';
import revaliSprite from '../assets/sprites/revali.webp';
import urbosaSprite from '../assets/sprites/urbosa.webp';
import sidonSprite from '../assets/sprites/sidon.webp';
import tifaSprite from '../assets/sprites/tifa.webp';
import aerithSprite from '../assets/sprites/aerith.webp';
import yuffieSprite from '../assets/sprites/yuffie.webp';

const sprites = [
  { name: 'Link', src: linkSprite },
  { name: 'Zelda', src: zeldaSprite },
  { name: 'Revali', src: revaliSprite },
  { name: 'Urbosa', src: urbosaSprite },
  { name: 'Sidon', src: sidonSprite },
  { name: 'Tifa', src: tifaSprite },
  { name: 'Aerith', src: aerithSprite },
  { name: 'Yuffie', src: yuffieSprite },
];

export const Mascot: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const { playClick } = useSFX();

  const nextMascot = () => {
    playClick();
    setCurrentIndex((prev) => (prev + 1) % sprites.length);
  };

  const currentSprite = sprites[currentIndex];

  return (
    <div className={`fixed bottom-4 right-4 z-[40] transition-all duration-500 transform ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
      <div className="relative group">
        {/* Tooltip/Name */}
        <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="bg-reflect-text text-white text-[10px] px-3 py-1 rounded-full shadow-lg whitespace-nowrap font-bold uppercase tracking-widest border border-white/20 backdrop-blur-md">
            {currentSprite.name}
          </div>
        </div>

        {/* Sprite Image */}
        <img 
          src={currentSprite.src} 
          alt={currentSprite.name}
          onClick={nextMascot}
          className="w-32 h-auto cursor-pointer drop-shadow-2xl hover:scale-110 transition-transform duration-300 select-none pointer-events-auto"
          style={{ filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.3))' }}
        />
        
        {/* Toggle visibility handle (minimal) */}
        <button 
          onClick={() => setIsVisible(!isVisible)}
          className="absolute -top-2 -left-2 w-5 h-5 bg-reflect-sidebar/80 border border-reflect-border rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span className="text-[10px]">✕</span>
        </button>
      </div>
    </div>
  );
};
