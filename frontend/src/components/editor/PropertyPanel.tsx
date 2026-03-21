import React, { useState } from 'react';
import { Note, NoteProperty } from '../../lib/types';
import { api } from '../../lib/api';
import { 
  Type, 
  MapPin,
  Clock,
  Sparkles,
  Tag
} from 'lucide-react';

interface PropertyPanelProps {
  note: Note;
  onUpdate: (updatedNote: Note) => void;
  onUpdateTags?: (noteId: number, tags: string[]) => Promise<void>;
}

export const PropertyPanel: React.FC<PropertyPanelProps> = ({ note, onUpdate, onUpdateTags }) => {
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [isSuggestionsExpanded, setIsSuggestionsExpanded] = useState(false);
  const [manualTag, setManualTag] = useState('');
  const [localTags, setLocalTags] = useState<string[]>(note.tags || []);
  
  // Sync local tags with prop when note changes
  React.useEffect(() => {
    setLocalTags(note.tags || []);
  }, [note.id, note.tags]);

  const locationValue = note.properties.find(p => p.name === 'Location' || p.name === '地点')?.value || '';

  const handleSuggestTags = async () => {
    setIsSuggesting(true);
    setIsSuggestionsExpanded(true);
    try {
      const response = await api.suggestTags(note.content);
      setSuggestedTags(response.tags);
    } catch (error) {
      console.error('Failed to suggest tags:', error);
    } finally {
      setIsSuggesting(false);
    }
  };

  const applyTag = async (tag: string) => {
    if (localTags.includes(tag)) return;
    
    const newTags = [...localTags, tag];
    setLocalTags(newTags);
    if (onUpdateTags) {
      onUpdateTags(note.id, newTags);
    } else {
      onUpdate({
        ...note,
        tags: newTags
      });
    }
    setSuggestedTags(prev => prev.filter(t => t !== tag));
  };

  const handleManualAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && manualTag.trim()) {
      e.preventDefault(); // 阻止默认行为，防止某些意外触发
      const tag = manualTag.trim();
      if (!localTags.includes(tag)) {
        const newTags = [...localTags, tag];
        setLocalTags(newTags);
        if (onUpdateTags) {
          onUpdateTags(note.id, newTags);
        } else {
          onUpdate({
            ...note,
            tags: newTags
          });
        }
      }
      setManualTag('');
    }
  };

  const [localLocation, setLocalLocation] = useState(locationValue);
  const [isFocused, setIsFocused] = useState(false);
  const lastSyncValueRef = React.useRef(locationValue);

  // Sync with prop when not focused
  React.useEffect(() => {
    // Only sync if we're not focused AND the prop is different from what we last synced
    // This prevents the "old value flash" when a blur triggers a slow background update
    if (!isFocused && locationValue !== localLocation) {
      // If the prop value just caught up to our last sync, we're good
      if (locationValue === lastSyncValueRef.current) return;
      
      setLocalLocation(locationValue);
      lastSyncValueRef.current = locationValue;
    }
  }, [locationValue, isFocused, localLocation]);

  const handleUpdateLocation = async (value: string) => {
    setLocalLocation(value);
  };

  const handleBlur = async () => {
    if (localLocation === locationValue) {
      setIsFocused(false);
      return;
    }

    // Immediately record the value we are about to sync to prevent flash in useEffect
    lastSyncValueRef.current = localLocation;

    try {
      // 查找或创建 Location 属性
      let locationProp = note.properties.find(p => p.name === 'Location' || p.name === '地点');
      
      if (locationProp) {
        const updatedProp = await api.updateNoteProperty(note.id, locationProp.id, { value: localLocation });
        onUpdate({
          ...note,
          properties: note.properties.map(p => p.id === locationProp?.id ? updatedProp : p)
        });
      } else {
        const newProp = await api.createNoteProperty(note.id, {
          name: 'Location',
          type: 'text',
          value: localLocation
        });
        onUpdate({
          ...note,
          properties: [...note.properties, newProp]
        });
      }
    } catch (error) {
      console.error('Failed to update location:', error);
      // Optional: restore old value on error
      setLocalLocation(locationValue);
    } finally {
      setIsFocused(false);
    }
  };

  const formattedTime = new Date(note.created_at).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="px-1 py-0.5 border-b border-stone-50 bg-white/30 space-y-0.5">
      {/* Tags Area */}
      <div className="flex flex-wrap gap-2 items-center min-h-[16px] px-1">
        {/* Debug Info */}
        {/* <span className="text-[8px] text-stone-300">({localTags.length})</span> */}
        
        {/* Existing Tags Display */}
        {localTags.length > 0 && (
          <div className="flex flex-wrap gap-1 items-center">
            {localTags.map(tag => (
              <span 
                key={tag} 
                className="inline-flex items-center gap-0.5 px-1.5 py-0 bg-stone-100 text-stone-600 rounded text-[9px] border border-stone-200"
              >
                {tag}
                <button 
                  onClick={() => {
                    const newTags = localTags.filter(t => t !== tag);
                    setLocalTags(newTags);
                    if (onUpdateTags) {
                      onUpdateTags(note.id, newTags);
                    } else {
                      onUpdate({
                        ...note,
                        tags: newTags
                      });
                    }
                  }}
                  className="hover:text-red-500 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Manual Add Tag */}
        <div className="flex items-center gap-1.5 group/tag-input">
          <Tag size={10} className="text-stone-400" />
          <input
            type="text"
            value={manualTag}
            onChange={(e) => setManualTag(e.target.value)}
            onKeyDown={handleManualAddTag}
            placeholder="添加标签..."
            className="w-16 focus:w-24 transition-all bg-transparent text-[10px] text-stone-600 focus:outline-none placeholder:text-stone-300"
          />
        </div>

        <div className="w-px h-3 bg-stone-100 mx-1" />

        {/* AI Suggest Button */}
        <button 
          onClick={handleSuggestTags}
          disabled={isSuggesting}
          className={`flex items-center gap-1 px-1.5 py-0 text-[9px] font-medium rounded transition-all ${isSuggesting ? 'bg-purple-50 text-purple-400 animate-pulse' : 'text-purple-500 hover:bg-purple-50'}`}
        >
          <Sparkles size={9} />
          <span>{isSuggesting ? '分析中...' : '智能标签'}</span>
        </button>

        {/* Suggestion Toggle */}
        {suggestedTags.length > 0 && (
          <button 
            onClick={() => setIsSuggestionsExpanded(!isSuggestionsExpanded)}
            className="text-[9px] text-stone-400 hover:text-stone-600 transition-colors"
          >
            {isSuggestionsExpanded ? '收起建议' : `查看建议 (${suggestedTags.length})`}
          </button>
        )}
      </div>

      {/* Suggested Tags (Collapsible) */}
      {isSuggestionsExpanded && suggestedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center px-2 py-1 bg-purple-50/30 rounded-md border border-purple-50/50 ml-1">
          <span className="text-[8px] uppercase tracking-wider text-purple-400 font-bold">建议内容:</span>
          {suggestedTags.map(tag => (
            <button 
              key={tag} 
              onClick={() => applyTag(tag)}
              className="px-1.5 py-0 bg-white text-purple-600 border border-purple-100 rounded text-[9px] hover:bg-purple-50 transition-colors shadow-sm"
            >
              + {tag}
            </button>
          ))}
          <button 
            onClick={() => {
              setSuggestedTags([]);
              setIsSuggestionsExpanded(false);
            }}
            className="ml-auto text-[8px] text-stone-400 hover:text-red-400"
          >
            清除建议
          </button>
        </div>
      )}

      {/* Simplified Properties Area - Horizontal Layout */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 py-0.5">
        {/* Created Time - Read Only */}
        <div className="flex items-center gap-1.5 px-1 text-stone-400">
          <Clock size={11} />
          <span className="text-[10px] text-stone-500">{formattedTime}</span>
        </div>

        {/* Location - Editable */}
        <div className="flex items-center gap-1.5 px-1 flex-1 min-w-[120px] max-w-[240px]">
          <MapPin size={11} className="text-stone-400 shrink-0" />
          <input
            type="text"
            value={localLocation}
            onChange={(e) => handleUpdateLocation(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            placeholder="添加地点..."
            className="w-full bg-transparent text-[10px] text-stone-600 focus:outline-none focus:bg-stone-50 px-1 py-0 rounded border border-transparent hover:border-stone-100 transition-all placeholder:text-stone-300"
          />
        </div>
      </div>
    </div>
  );
};
