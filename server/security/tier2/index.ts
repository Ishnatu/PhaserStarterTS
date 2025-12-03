import { securityEventBus } from '../events/eventBus';
import { processPatternDetection } from './patternDetector';
import { processAnomalyAnalysis } from './anomalyAnalyzer';

export function initializeTier2Processors(): void {
  securityEventBus.registerProcessor('patternDetector', processPatternDetection);
  securityEventBus.registerProcessor('anomalyAnalyzer', processAnomalyAnalysis);
  
  console.log('[Tier2] Async security processors initialized');
}

export * from './patternDetector';
export * from './anomalyAnalyzer';
