import { mockSupportService } from './mockSupport.ts'
import { liveSupportService } from './liveSupport.ts'
import type { SupportService } from '../types.ts'

export const isLive = import.meta.env.VITE_SUPPORT_MODE === 'live'
export const supportService: SupportService = isLive ? liveSupportService : mockSupportService
