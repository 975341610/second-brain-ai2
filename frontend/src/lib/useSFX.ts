import clickSfx from '../assets/sfx/sfx_click.wav';
import successSfx from '../assets/sfx/sfx_success.wav';
import levelUpSfx from '../assets/sfx/sfx_level_up.wav';
import alertSfx from '../assets/sfx/sfx_alert.wav';

export const useSFX = () => {
  const playSfx = (src: string) => {
    const audio = new Audio(src);
    audio.volume = 0.4;
    audio.play().catch(e => console.warn('SFX play blocked:', e));
  };

  return {
    playClick: () => playSfx(clickSfx),
    playSuccess: () => playSfx(successSfx),
    playLevelUp: () => playSfx(levelUpSfx),
    playAlert: () => playSfx(alertSfx),
  };
};
