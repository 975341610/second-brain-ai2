import React, { useState } from 'react';
import { Note, NoteProperty } from '../../lib/types';
import { api } from '../../lib/api';
import {
  Type,
  MapPin,
  Clock,
  Sparkles,
  Tag,
  Lock,
  LockOpen
} from 'lucide-react';

const PRIVATE_TAGS = new Set(['私密', 'private']);

interface PropertyPanelProps {
  note: Note;
  onUpdate: (updatedNote: Note) => void;
  onUpdateTags?: (noteId: number, tags: string[]) => Promise<void>;
  isPrivate?: boolean;
  onTogglePrivate?: () => void;
}

export const PropertyPanel: React.FC<PropertyPanelProps> = ({ note, onUpdate, onUpdateTags, isPrivate = false, onTogglePrivate }) => {
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [isSuggestionsExpanded, setIsSuggestionsExpanded] = useState(false);
  const [manualTag, setManualTag] = useState('');
  const [localTags, setLocalTags] = useState<string[]>(note.tags || []);

  React.useEffect(() => {
    setLocalTags(note.tags || []);
  }, [note.id, note.tags]);

  const locationValue = note.properties.find(p => p.name === 'Location' || p.name === '地点')?.value || '';

  const handleSuggestTags = async () => {
    if (isPrivate) {
      return;
    }
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
      e.preventDefault();
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

  React.useEffect(() => {
    if (!isFocused && locationValue !== localLocation) {
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

    lastSyncValueRef.current = localLocation;

    try {
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

  const visibleTags = React.useMemo(
    () => localTags.filter((tag) => !PRIVATE_TAGS.has(tag.toLowerCase())),
    [localTags],
  );

  const displayTags = isExpanded ? visibleTags : visibleTags.slice(0, 5);
  const hasMoreTags = visibleTags.length > 5;

  return (
    <div className="px-0 py-2 space-y-2 mb-0 border-b border-reflect-border/20">
      <div className="flex flex-wrap gap-x-4 gap-y-2 items-center min-h-[24px]">
        {localTags.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            {displayTags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-reflect-sidebar/60 text-reflect-text rounded-md text-[10px] font-medium border border-reflect-border/30 hover:border-reflect-accent/30 transition-colors"
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
                  className="opacity-40 hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </span>
            ))}

            {hasMoreTags && !isExpanded && (
              <button
                onClick={() => setIsExpanded(true)}
                className="text-[10px] font-bold text-reflect-muted/60 hover:text-reflect-accent transition-colors px-1"
              >
                +{visibleTags.length - 5}
              </button>
            )}

            {hasMoreTags && isExpanded && (
              <button
                onClick={() => setIsExpanded(false)}
                className="text-[10px] font-bold text-reflect-muted/60 hover:text-reflect-accent transition-colors px-1"
              >
                收起
              </button>
            )}
          </div>
        )}

        <button
          onClick={onTogglePrivate}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${isPrivate ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-reflect-border/40 bg-reflect-sidebar/40 text-reflect-muted hover:text-reflect-text'}`}
        >
          {isPrivate ? <Lock size={11} /> : <LockOpen size={11} />}
          {isPrivate ? '私密已开启' : '设为私密'}
        </button>

        <div className="flex items-center gap-2 group/tag-input">
          <Tag size={12} className="text-reflect-muted/40" />
          <input
            type="text"
            value={manualTag}
            onChange={(e) => setManualTag(e.target.value)}
            onKeyDown={handleManualAddTag}
            placeholder="Add tag..."
            className="w-20 transition-all bg-transparent text-[11px] text-reflect-text focus:outline-none placeholder:text-reflect-muted/30"
          />
        </div>

        <button
          onClick={handleSuggestTags}
          disabled={isSuggesting || isPrivate}
          className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${isSuggesting ? 'bg-amber-50 text-amber-500 animate-pulse' : isPrivate ? 'bg-reflect-sidebar/30 text-reflect-muted/40 cursor-not-allowed' : 'text-amber-600/60 hover:text-amber-600 hover:bg-amber-50'}`}
        >
          <Sparkles size={11} />
          <span>{isPrivate ? 'Private Locked' : isSuggesting ? 'Analyzing...' : 'AI Insights'}</span>
        </button>

        {suggestedTags.length > 0 && (
          <button
            onClick={() => setIsSuggestionsExpanded(!isSuggestionsExpanded)}
            className="text-[10px] font-bold uppercase tracking-widest text-reflect-muted/40 hover:text-reflect-muted transition-colors"
          >
            {isSuggestionsExpanded ? 'Hide' : `Suggestions (${suggestedTags.length})`}
          </button>
        )}
      </div>

      {isSuggestionsExpanded && suggestedTags.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center p-3 bg-amber-50/20 rounded-xl border border-amber-100/30">
          <span className="text-[9px] uppercase tracking-widest text-amber-600/50 font-bold">Suggested:</span>
          {suggestedTags.map(tag => (
            <button
              key={tag}
              onClick={() => applyTag(tag)}
              className="px-2 py-0.5 bg-white/80 text-amber-700 border border-amber-100/50 rounded-md text-[10px] font-medium hover:bg-white transition-colors shadow-sm"
            >
              + {tag}
            </button>
          ))}
          <button
            onClick={() => {
              setSuggestedTags([]);
              setIsSuggestionsExpanded(false);
            }}
            className="ml-auto text-[10px] text-reflect-muted/40 hover:text-rose-400 font-medium"
          >
            Clear
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <div className="flex items-center gap-2 text-reflect-muted/40">
          <Clock size={12} />
          <span className="text-[11px] font-medium uppercase tracking-tighter">{formattedTime}</span>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[150px] max-w-[300px]">
          <MapPin size={12} className="text-reflect-muted/40 shrink-0" />
          <input
            type="text"
            value={localLocation}
            onChange={(e) => handleUpdateLocation(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={handleBlur}
            placeholder="Add location..."
            className="w-full bg-transparent text-[11px] text-reflect-text font-medium focus:outline-none transition-all placeholder:text-reflect-muted/30"
          />
        </div>
      </div>
    </div>
  );
};
