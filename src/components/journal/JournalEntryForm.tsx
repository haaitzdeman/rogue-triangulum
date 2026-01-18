'use client';

/**
 * Journal Entry Form Component
 * 
 * Form for adding trade journal entries with all required fields.
 */

import { useState } from 'react';
import {
    MISTAKE_CATEGORIES,
    SETUP_TYPES,
    type MistakeCategory,
    type SetupType,
    type EntryType,
} from '@/lib/journal/types';
import type { DeskType } from '@/lib/experts/types';

interface JournalEntryFormProps {
    deskType: DeskType;
    onSubmit: (entry: JournalFormData) => void;
    onCancel?: () => void;
    initialSymbol?: string;
}

export interface JournalFormData {
    symbol: string;
    entryType: EntryType;
    deskType: DeskType;
    setupType?: SetupType;
    direction?: 'long' | 'short';
    entryPrice?: number;
    exitPrice?: number;
    positionSize?: number;
    pnl?: number;
    notes: string;
    lessonsLearned?: string;
    mistakes: MistakeCategory[];
    tags: string[];
}

export function JournalEntryForm({
    deskType,
    onSubmit,
    onCancel,
    initialSymbol = ''
}: JournalEntryFormProps) {
    const [formData, setFormData] = useState<JournalFormData>({
        symbol: initialSymbol,
        entryType: 'trade',
        deskType,
        notes: '',
        mistakes: [],
        tags: [],
    });

    const [tagInput, setTagInput] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Calculate PnL if prices are set
        let pnl = formData.pnl;
        if (formData.entryPrice && formData.exitPrice && formData.positionSize) {
            const direction = formData.direction === 'short' ? -1 : 1;
            pnl = (formData.exitPrice - formData.entryPrice) * formData.positionSize * direction;
        }

        onSubmit({ ...formData, pnl });
    };

    const toggleMistake = (mistake: MistakeCategory) => {
        setFormData(prev => ({
            ...prev,
            mistakes: prev.mistakes.includes(mistake)
                ? prev.mistakes.filter(m => m !== mistake)
                : [...prev.mistakes, mistake],
        }));
    };

    const addTag = () => {
        if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
            setFormData(prev => ({
                ...prev,
                tags: [...prev.tags, tagInput.trim()],
            }));
            setTagInput('');
        }
    };

    const removeTag = (tag: string) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.filter(t => t !== tag),
        }));
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 p-6 bg-surface rounded-lg">
            <h2 className="text-xl font-bold text-white">New Journal Entry</h2>

            {/* Entry Type */}
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Entry Type</label>
                <div className="flex gap-2">
                    {(['trade', 'observation', 'lesson', 'mistake'] as EntryType[]).map(type => (
                        <button
                            key={type}
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, entryType: type }))}
                            className={`px-4 py-2 rounded capitalize ${formData.entryType === type
                                    ? 'bg-accent text-black'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>

            {/* Symbol */}
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Symbol</label>
                <input
                    type="text"
                    value={formData.symbol}
                    onChange={e => setFormData(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                    placeholder="AAPL"
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                    required
                />
            </div>

            {/* Trade-specific fields */}
            {formData.entryType === 'trade' && (
                <>
                    {/* Direction & Setup */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Direction</label>
                            <select
                                value={formData.direction || ''}
                                onChange={e => setFormData(prev => ({
                                    ...prev,
                                    direction: e.target.value as 'long' | 'short'
                                }))}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                            >
                                <option value="">Select...</option>
                                <option value="long">Long</option>
                                <option value="short">Short</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Setup Type</label>
                            <select
                                value={formData.setupType || ''}
                                onChange={e => setFormData(prev => ({
                                    ...prev,
                                    setupType: e.target.value as SetupType
                                }))}
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                            >
                                <option value="">Select...</option>
                                {Object.entries(SETUP_TYPES).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Prices */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Entry Price</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.entryPrice || ''}
                                onChange={e => setFormData(prev => ({
                                    ...prev,
                                    entryPrice: parseFloat(e.target.value) || undefined
                                }))}
                                placeholder="0.00"
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Exit Price</label>
                            <input
                                type="number"
                                step="0.01"
                                value={formData.exitPrice || ''}
                                onChange={e => setFormData(prev => ({
                                    ...prev,
                                    exitPrice: parseFloat(e.target.value) || undefined
                                }))}
                                placeholder="0.00"
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Shares/Contracts</label>
                            <input
                                type="number"
                                value={formData.positionSize || ''}
                                onChange={e => setFormData(prev => ({
                                    ...prev,
                                    positionSize: parseFloat(e.target.value) || undefined
                                }))}
                                placeholder="100"
                                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                            />
                        </div>
                    </div>

                    {/* P&L Display */}
                    {formData.entryPrice && formData.exitPrice && formData.positionSize && (
                        <div className="p-4 bg-gray-800 rounded">
                            <span className="text-gray-400">Calculated P&L: </span>
                            {(() => {
                                const direction = formData.direction === 'short' ? -1 : 1;
                                const pnl = (formData.exitPrice - formData.entryPrice) * formData.positionSize * direction;
                                return (
                                    <span className={pnl >= 0 ? 'text-profit' : 'text-loss'}>
                                        ${pnl.toFixed(2)}
                                    </span>
                                );
                            })()}
                        </div>
                    )}

                    {/* Mistakes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Mistakes (if any)</label>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(MISTAKE_CATEGORIES).map(([key, info]) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => toggleMistake(key as MistakeCategory)}
                                    className={`px-3 py-1 rounded text-sm ${formData.mistakes.includes(key as MistakeCategory)
                                            ? 'bg-loss text-white'
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        }`}
                                    title={info.description}
                                >
                                    {info.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* Notes */}
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Notes</label>
                <textarea
                    value={formData.notes}
                    onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="What happened? What did you observe?"
                    rows={4}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                    required
                />
            </div>

            {/* Lessons Learned */}
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Lessons Learned</label>
                <textarea
                    value={formData.lessonsLearned || ''}
                    onChange={e => setFormData(prev => ({ ...prev, lessonsLearned: e.target.value }))}
                    placeholder="What will you do differently next time?"
                    rows={2}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                />
            </div>

            {/* Tags */}
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Tags</label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                        placeholder="Add tag..."
                        className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                    />
                    <button
                        type="button"
                        onClick={addTag}
                        className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
                    >
                        Add
                    </button>
                </div>
                {formData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                        {formData.tags.map(tag => (
                            <span
                                key={tag}
                                className="px-2 py-1 bg-accent/20 text-accent rounded text-sm flex items-center gap-1"
                            >
                                {tag}
                                <button
                                    type="button"
                                    onClick={() => removeTag(tag)}
                                    className="hover:text-white"
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-4">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    className="px-6 py-2 bg-accent text-black font-bold rounded hover:bg-accent/90"
                >
                    Save Entry
                </button>
            </div>
        </form>
    );
}
