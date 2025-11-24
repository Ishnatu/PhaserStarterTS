/**
 * Seeded Random Number Generator for server-side game logic
 * Provides deterministic, auditable RNG with logging capabilities
 */

export class SeededRNG {
  private seed: number;
  private callCount: number = 0;
  private auditLog: Array<{ callNumber: number; value: number; context?: string }> = [];

  constructor(seed?: number) {
    this.seed = seed || Math.floor(Math.random() * 1000000);
  }

  /**
   * Generate next random number [0, 1) using xorshift algorithm
   * [SERVER RNG] Deterministic random generation
   */
  next(context?: string): number {
    // xorshift algorithm for deterministic pseudo-random numbers
    let x = this.seed;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.seed = x;
    
    const value = ((x >>> 0) / 0x100000000);
    this.callCount++;
    
    // Audit logging
    if (this.auditLog.length < 10000) { // Prevent memory bloat
      this.auditLog.push({ callNumber: this.callCount, value, context });
    }
    
    return value;
  }

  /**
   * Generate random integer in range [min, max]
   * [SERVER RNG] Integer generation
   */
  nextInt(min: number, max: number, context?: string): number {
    return Math.floor(this.next(context) * (max - min + 1)) + min;
  }

  /**
   * Simulate dice roll (1 to n)
   * [SERVER RNG] Dice roll
   */
  rollDie(sides: number, context?: string): number {
    return this.nextInt(1, sides, context);
  }

  /**
   * Get audit log for security review
   */
  getAuditLog(): Array<{ callNumber: number; value: number; context?: string }> {
    return [...this.auditLog];
  }

  /**
   * Get seed for reproduction
   */
  getSeed(): number {
    return this.seed;
  }

  /**
   * Get total RNG calls made
   */
  getCallCount(): number {
    return this.callCount;
  }
}

/**
 * Default RNG instance for server operations
 * Each request should create a new instance with unique seed
 */
export function createRNG(seed?: number): SeededRNG {
  return new SeededRNG(seed);
}
