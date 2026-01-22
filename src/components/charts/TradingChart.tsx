"use client";

/**
 * TradingView Lightweight Charts Component (v5)
 * 
 * Adaptive charting component that renders different styles
 * based on the trading desk context.
 */

import { useEffect, useRef, useState } from 'react';
import {
    createChart,
    ColorType,
    CandlestickSeries,
    HistogramSeries,
    LineSeries,
} from 'lightweight-charts';
import type { IChartApi, Time, ISeriesApi } from 'lightweight-charts';
import type { Candle, Timeframe } from '@/lib/data/types';

// Chart recipe types for different desks
export type ChartRecipe = 'daytrading' | 'options' | 'swing' | 'investing';

interface ChartConfig {
    showVolume: boolean;
    showVWAP: boolean;
    showGrid: boolean;
    candleUpColor: string;
    candleDownColor: string;
    volumeUpColor: string;
    volumeDownColor: string;
}

// Pre-configured chart recipes for each desk type
const CHART_RECIPES: Record<ChartRecipe, ChartConfig> = {
    daytrading: {
        showVolume: true,
        showVWAP: true,
        showGrid: true,
        candleUpColor: '#10b981',
        candleDownColor: '#ef4444',
        volumeUpColor: 'rgba(16, 185, 129, 0.5)',
        volumeDownColor: 'rgba(239, 68, 68, 0.5)',
    },
    options: {
        showVolume: false,
        showVWAP: false,
        showGrid: true,
        candleUpColor: '#06b6d4',
        candleDownColor: '#f97316',
        volumeUpColor: 'rgba(6, 182, 212, 0.5)',
        volumeDownColor: 'rgba(249, 115, 22, 0.5)',
    },
    swing: {
        showVolume: true,
        showVWAP: false,
        showGrid: false,
        candleUpColor: '#22c55e',
        candleDownColor: '#dc2626',
        volumeUpColor: 'rgba(34, 197, 94, 0.5)',
        volumeDownColor: 'rgba(220, 38, 38, 0.5)',
    },
    investing: {
        showVolume: false,
        showVWAP: false,
        showGrid: true,
        candleUpColor: '#3b82f6',
        candleDownColor: '#9333ea',
        volumeUpColor: 'rgba(59, 130, 246, 0.5)',
        volumeDownColor: 'rgba(147, 51, 234, 0.5)',
    },
};

interface TradingChartProps {
    candles: Candle[];
    symbol: string;
    timeframe: Timeframe;
    recipe?: ChartRecipe;
    height?: number;
    showTimeframeSelector?: boolean;
    onTimeframeChange?: (tf: Timeframe) => void;
}

export function TradingChart({
    candles,
    symbol,
    timeframe,
    recipe = 'swing',
    height = 400,
    showTimeframeSelector = true,
    onTimeframeChange,
}: TradingChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);

    // Series refs to avoid recreation
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

    const [currentRecipe, setCurrentRecipe] = useState<ChartRecipe>(recipe);
    const config = CHART_RECIPES[currentRecipe];

    // Available timeframes by desk type
    const timeframes: Record<ChartRecipe, Timeframe[]> = {
        daytrading: ['1m', '5m', '15m', '1h'],
        options: ['1h', '1d', '1w'],
        swing: ['1h', '4h', '1d', '1w'],
        investing: ['1d', '1w', '1M'],
    };

    // Helper to update data on existing series
    const updateChartData = (
        cSeries: ISeriesApi<"Candlestick">,
        vSeries: ISeriesApi<"Histogram"> | null,
        vwSeries: ISeriesApi<"Line"> | null,
        data: Candle[],
        cfg: ChartConfig
    ) => {
        if (data.length > 0) {
            const chartData = data.map(c => ({
                time: (c.timestamp / 1000) as Time,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
            }));
            cSeries.setData(chartData);

            if (vSeries && cfg.showVolume) {
                const volumeData = data.map(c => ({
                    time: (c.timestamp / 1000) as Time,
                    value: c.volume,
                    color: c.close >= c.open ? cfg.volumeUpColor : cfg.volumeDownColor,
                }));
                vSeries.setData(volumeData);
            }

            if (vwSeries && cfg.showVWAP) {
                const vwapData = data
                    .filter(c => c.vwap !== undefined)
                    .map(c => ({
                        time: (c.timestamp / 1000) as Time,
                        value: c.vwap!,
                    }));
                if (vwapData.length > 0) {
                    vwSeries.setData(vwapData);
                }
            }
        }
    };

    // 1. Initialize chart and series (Runs only when recipe or height changes)
    // ⚡ Bolt: Performance optimization - separated chart creation from data updates
    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Cleanup previous chart
        if (chartRef.current) {
            chartRef.current.remove();
            chartRef.current = null;
            candleSeriesRef.current = null;
            volumeSeriesRef.current = null;
            vwapSeriesRef.current = null;
        }

        const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height,
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#9ca3af',
            },
            grid: {
                vertLines: { color: config.showGrid ? 'rgba(255, 255, 255, 0.05)' : 'transparent' },
                horzLines: { color: config.showGrid ? 'rgba(255, 255, 255, 0.05)' : 'transparent' },
            },
            crosshair: {
                mode: 1, // Normal mode
                vertLine: { color: 'rgba(255, 255, 255, 0.2)' },
                horzLine: { color: 'rgba(255, 255, 255, 0.2)' },
            },
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                timeVisible: true,
                secondsVisible: false,
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
        });

        chartRef.current = chart;

        // Add candlestick series
        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: config.candleUpColor,
            downColor: config.candleDownColor,
            borderUpColor: config.candleUpColor,
            borderDownColor: config.candleDownColor,
            wickUpColor: config.candleUpColor,
            wickDownColor: config.candleDownColor,
        });
        candleSeriesRef.current = candleSeries;

        // Add volume series if enabled
        if (config.showVolume) {
            const volumeSeries = chart.addSeries(HistogramSeries, {
                color: config.volumeUpColor,
                priceFormat: { type: 'volume' },
                priceScaleId: 'volume',
            });
            volumeSeriesRef.current = volumeSeries;

            chart.priceScale('volume').applyOptions({
                scaleMargins: { top: 0.8, bottom: 0 },
            });
        }

        // Add VWAP line if enabled
        if (config.showVWAP) {
            const vwapSeries = chart.addSeries(LineSeries, {
                color: '#f59e0b',
                lineWidth: 2,
                priceScaleId: 'right',
                title: 'VWAP',
            });
            vwapSeriesRef.current = vwapSeries;
        }

        // Set initial data immediately if available
        updateChartData(
            candleSeries,
            volumeSeriesRef.current,
            vwapSeriesRef.current,
            candles,
            config
        );

        if (candles.length > 0) {
            chart.timeScale().fitContent();
        }

        // Handle resize
        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                });
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            chartRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [height, currentRecipe]); // config is derived from currentRecipe

    // 2. Handle Data Updates (Runs when candles change)
    useEffect(() => {
        if (!chartRef.current || !candleSeriesRef.current) return;

        updateChartData(
            candleSeriesRef.current,
            volumeSeriesRef.current,
            vwapSeriesRef.current,
            candles,
            config
        );

        // Ensure we fit content so the new data is visible
        if (candles.length > 0) {
            chartRef.current.timeScale().fitContent();
        }

    }, [candles, config]); // config is needed for colors in volume series update

    return (
        <div className="card p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-lg">{symbol}</span>
                    <span className="text-sm text-foreground-muted">{timeframe}</span>
                </div>

                {/* Timeframe Selector */}
                {showTimeframeSelector && (
                    <div className="flex gap-1">
                        {timeframes[currentRecipe].map((tf) => (
                            <button
                                key={tf}
                                onClick={() => onTimeframeChange?.(tf)}
                                className={`px-2 py-1 text-xs rounded ${tf === timeframe
                                        ? 'bg-accent text-white'
                                        : 'bg-background-tertiary text-foreground-muted hover:text-foreground'
                                    }`}
                            >
                                {tf}
                            </button>
                        ))}
                    </div>
                )}

                {/* Recipe Selector */}
                <div className="flex gap-1">
                    {(Object.keys(CHART_RECIPES) as ChartRecipe[]).map((r) => (
                        <button
                            key={r}
                            onClick={() => setCurrentRecipe(r)}
                            className={`px-2 py-1 text-2xs rounded capitalize ${r === currentRecipe
                                    ? 'bg-accent/20 text-accent border border-accent/30'
                                    : 'text-foreground-muted hover:text-foreground'
                                }`}
                        >
                            {r}
                        </button>
                    ))}
                </div>
            </div>

            {/* Chart Container */}
            <div ref={chartContainerRef} className="w-full" style={{ height }} />

            {/* Legend */}
            {config.showVWAP && (
                <div className="mt-2 flex items-center gap-4 text-xs text-foreground-muted">
                    <span className="flex items-center gap-1">
                        <span className="w-3 h-0.5 bg-caution rounded" />
                        VWAP
                    </span>
                </div>
            )}
        </div>
    );
}
