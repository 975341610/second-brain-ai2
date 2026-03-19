export type SlashItem = {
  group: string;
  label: string;
  description: string;
  keywords: string[];
  action: () => void;
};

export type MediaSelection = {
  type: 'image' | 'videoNode' | 'audioNode' | 'embedNode' | 'youtube' | null;
  width: string;
};

export type FloatingPosition = {
  left: number;
  top: number;
};
