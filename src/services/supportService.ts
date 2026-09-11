import { mockSupportService } from './mockSupport.ts'
import type { SupportService } from '../types.ts'

// Single integration boundary. Stage 2 can implement SupportService over a same-origin
// backend. Provider/database credentials must never be added to VITE_* variables.
const mode = import.meta.env.VITE_SUPPORT_MODE || 'mock'
export const supportService: SupportService =
  mode === 'mock'
    ? mockSupportService
    : {
        async ask() {
          throw new Error('This deployment supports mock mode only. Set VITE_SUPPORT_MODE=mock.')
        },
        createHandoff() {
          throw new Error('Live handoff is not configured. Use mock mode for this demo.')
        },
      }
