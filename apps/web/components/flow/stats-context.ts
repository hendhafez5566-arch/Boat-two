'use client';
import { createContext } from 'react';

export type NodeStats = { sent: number; delivered: number; subscribers: number; errors: number };
/** nodeId → إحصائيات الإرسال الفعلية لهذه الخطوة */
export const FlowStatsContext = createContext<Record<string, NodeStats>>({});

export type SeqInfo = { name: string; status: string; deliveryTime: string | null; timezone: string };
/** sequenceId → بيانات التسلسل لعرضها على بطاقة الخطوة */
export const FlowSequencesContext = createContext<Record<string, SeqInfo>>({});

export type ButtonStats = { clicks: number; subscribers: number; errors: number };
/** `${nodeId}:${buttonId}` → real tap counts of that button */
export const FlowButtonStatsContext = createContext<Record<string, ButtonStats>>({});

/** Build mode keeps content primary; analytics remain available on demand. */
export const FlowAnalyticsContext = createContext(false);
