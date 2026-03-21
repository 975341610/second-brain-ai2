import type { ReactNode } from 'react';

export type SlashItem = {
  group: string;
  label: string;
  description: string;
  keywords: string[];
  action: (chain: any) => void;
  icon?: ReactNode;
};

export type MediaSelection = {
  type: 'image' | 'videoNode' | 'audioNode' | 'embedNode' | 'youtube' | null;
  width: string;
};

export type FloatingPosition = {
  left: number;
  top: number;
};
