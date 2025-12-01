const originalMathRandom = Math.random;
const originalDateNow = Date.now;
const originalFetch = window.fetch;

interface IntegrityState {
  initialized: boolean;
  violations: number;
  lastCheck: number;
  mathRandomTamperCount: number;
}

const state: IntegrityState = {
  initialized: false,
  violations: 0,
  lastCheck: 0,
  mathRandomTamperCount: 0,
};

function reportViolation(type: string, details?: string): void {
  state.violations++;
  
  try {
    originalFetch.call(window, '/api/security/violation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        type,
        details,
        timestamp: originalDateNow.call(Date),
        violations: state.violations,
      }),
    }).catch(() => {});
  } catch {
  }
}

function monitorMathRandom(): void {
  const checkRandom = () => {
    try {
      if (Math.random !== originalMathRandom) {
        state.mathRandomTamperCount++;
        if (state.mathRandomTamperCount <= 3) {
          reportViolation('MATH_RANDOM_TAMPERED', `attempt ${state.mathRandomTamperCount}`);
        }
      }
    } catch {
    }
  };
  
  setInterval(checkRandom, 30000);
}

function protectFetch(): void {
  const wrappedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    
    if (url.includes('/api/') && init?.body) {
      try {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
        if (body && (body.__bypass || body.__admin || body.__override || body.__cheat)) {
          reportViolation('SUSPICIOUS_API_BODY', url);
          throw new Error('Request blocked');
        }
      } catch (e) {
        if ((e as Error).message === 'Request blocked') throw e;
      }
    }
    
    return originalFetch.call(window, input, init);
  };
  
  try {
    (window as any).fetch = wrappedFetch;
  } catch {
  }
}

function detectSpeedHack(): void {
  let lastTime = originalDateNow.call(Date);
  let consecutiveFastCount = 0;
  
  const check = () => {
    const now = originalDateNow.call(Date);
    const elapsed = now - lastTime;
    const expectedElapsed = 5000;
    
    if (elapsed < expectedElapsed * 0.3) {
      consecutiveFastCount++;
      if (consecutiveFastCount >= 3) {
        reportViolation('SPEED_HACK_DETECTED', `elapsed: ${elapsed}, expected: ${expectedElapsed}`);
        consecutiveFastCount = 0;
      }
    } else {
      consecutiveFastCount = 0;
    }
    
    lastTime = now;
  };
  
  setInterval(check, 5000);
}

function monitorGlobalTampering(): void {
  const criticalFunctions = [
    { obj: Math, prop: 'random', original: originalMathRandom },
    { obj: Date, prop: 'now', original: originalDateNow },
  ];
  
  const check = () => {
    for (const { obj, prop, original } of criticalFunctions) {
      try {
        if ((obj as any)[prop] !== original) {
          reportViolation('GLOBAL_FUNCTION_TAMPERED', `${obj.constructor.name}.${prop}`);
        }
      } catch {
      }
    }
  };
  
  setInterval(check, 60000);
}

export function initializeIntegrityGuard(): void {
  if (state.initialized) return;
  
  state.initialized = true;
  state.lastCheck = Date.now();
  
  monitorMathRandom();
  protectFetch();
  detectSpeedHack();
  monitorGlobalTampering();
  
  window.addEventListener('error', (event) => {
    if (event.message?.includes('integrity') || event.message?.includes('tamper')) {
      reportViolation('INTEGRITY_ERROR', event.message);
    }
  });
}

export function getIntegrityStatus(): { violations: number; initialized: boolean } {
  return {
    violations: state.violations,
    initialized: state.initialized,
  };
}

export function createSecureRandom(): () => number {
  return () => originalMathRandom.call(Math);
}
