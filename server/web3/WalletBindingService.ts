import { ethers } from 'ethers';
import { db } from '../db';
import { playerWalletBindings } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { AuditLogger } from './AuditLogger';

export interface WalletBindingRequest {
  playerId: string;
  walletAddress: string;
  attestationConfirmed: boolean;
}

export interface WalletBindingResult {
  success: boolean;
  error?: string;
  binding?: {
    id: string;
    walletAddress: string;
    boundAt: Date;
    status: string;
  };
}

export interface UnbindRequest {
  playerId: string;
  confirmUnbind: boolean;
}

export class WalletBindingService {
  private static UNBIND_COOLDOWN_DAYS = 7;
  
  private static validateWalletAddress(address: string): string {
    if (!address || typeof address !== 'string') {
      throw new Error('Wallet address is required');
    }
    
    let normalizedAddress = address.trim();
    
    if (normalizedAddress.toLowerCase().startsWith('ronin:')) {
      normalizedAddress = '0x' + normalizedAddress.slice(6);
    }
    
    if (!ethers.isAddress(normalizedAddress)) {
      throw new Error('Invalid wallet address format');
    }
    
    return ethers.getAddress(normalizedAddress);
  }

  static async getBinding(playerId: string): Promise<WalletBindingResult> {
    try {
      const [binding] = await db
        .select()
        .from(playerWalletBindings)
        .where(eq(playerWalletBindings.playerId, playerId))
        .limit(1);

      if (!binding) {
        return { success: true, binding: undefined };
      }

      return {
        success: true,
        binding: {
          id: binding.id,
          walletAddress: binding.walletAddress,
          boundAt: binding.boundAt,
          status: binding.status,
        },
      };
    } catch (error: any) {
      console.error('Get wallet binding error:', error);
      return { success: false, error: 'Failed to retrieve wallet binding' };
    }
  }

  static async bindWallet(
    request: WalletBindingRequest,
    sessionId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<WalletBindingResult> {
    if (!request.attestationConfirmed) {
      return { success: false, error: 'You must acknowledge the wallet binding terms' };
    }

    let checksummedAddress: string;
    try {
      checksummedAddress = this.validateWalletAddress(request.walletAddress);
    } catch (error: any) {
      return { success: false, error: error.message };
    }

    return db.transaction(async (tx) => {
      const [existingBinding] = await tx
        .select()
        .from(playerWalletBindings)
        .where(eq(playerWalletBindings.playerId, request.playerId))
        .limit(1)
        .for('update');

      if (existingBinding) {
        if (existingBinding.status === 'active') {
          return { 
            success: false, 
            error: 'You already have a wallet bound. Request unbinding first and wait for the cooldown period.' 
          };
        }
        
        if (existingBinding.status === 'pending_unbind') {
          const now = new Date();
          if (existingBinding.unbindAvailableAt && now < existingBinding.unbindAvailableAt) {
            const daysLeft = Math.ceil(
              (existingBinding.unbindAvailableAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            );
            return { 
              success: false, 
              error: `Unbinding in progress. ${daysLeft} day(s) remaining before you can bind a new wallet.` 
            };
          }
          
          await tx
            .update(playerWalletBindings)
            .set({
              walletAddress: checksummedAddress,
              boundAt: new Date(),
              attestedAt: new Date(),
              lastUsedAt: null,
              unbindRequestedAt: null,
              unbindAvailableAt: null,
              status: 'active',
              updatedAt: new Date(),
            })
            .where(eq(playerWalletBindings.id, existingBinding.id));

          await AuditLogger.log({
            eventType: 'wallet_rebound',
            playerId: request.playerId,
            sessionId,
            ipAddress,
            userAgent,
            severity: 'info',
            metadata: {
              previousWallet: existingBinding.walletAddress,
              newWallet: checksummedAddress,
              previousBindingId: existingBinding.id,
            },
          });

          return {
            success: true,
            binding: {
              id: existingBinding.id,
              walletAddress: checksummedAddress,
              boundAt: new Date(),
              status: 'active',
            },
          };
        }
      }

      const [existingWalletBinding] = await tx
        .select()
        .from(playerWalletBindings)
        .where(
          and(
            eq(playerWalletBindings.walletAddress, checksummedAddress),
            eq(playerWalletBindings.status, 'active')
          )
        )
        .limit(1);

      if (existingWalletBinding) {
        await AuditLogger.log({
          eventType: 'wallet_binding_duplicate_attempt',
          playerId: request.playerId,
          sessionId,
          ipAddress,
          userAgent,
          severity: 'warning',
          metadata: {
            walletAddress: checksummedAddress,
            existingOwner: existingWalletBinding.playerId,
          },
        });
        return { 
          success: false, 
          error: 'This wallet is already bound to another account' 
        };
      }

      const [newBinding] = await tx
        .insert(playerWalletBindings)
        .values({
          playerId: request.playerId,
          walletAddress: checksummedAddress,
          boundAt: new Date(),
          attestedAt: new Date(),
          status: 'active',
        })
        .returning();

      await AuditLogger.log({
        eventType: 'wallet_bound',
        playerId: request.playerId,
        sessionId,
        ipAddress,
        userAgent,
        severity: 'info',
        metadata: {
          bindingId: newBinding.id,
          walletAddress: checksummedAddress,
        },
      });

      return {
        success: true,
        binding: {
          id: newBinding.id,
          walletAddress: checksummedAddress,
          boundAt: newBinding.boundAt,
          status: newBinding.status,
        },
      };
    }).catch((error: any) => {
      console.error('Wallet binding error:', error);
      return { success: false, error: 'Failed to bind wallet' };
    });
  }

  static async requestUnbind(
    request: UnbindRequest,
    sessionId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<WalletBindingResult> {
    if (!request.confirmUnbind) {
      return { success: false, error: 'You must confirm the unbinding request' };
    }

    return db.transaction(async (tx) => {
      const [binding] = await tx
        .select()
        .from(playerWalletBindings)
        .where(eq(playerWalletBindings.playerId, request.playerId))
        .limit(1)
        .for('update');

      if (!binding) {
        return { success: false, error: 'No wallet binding found' };
      }

      if (binding.status !== 'active') {
        return { success: false, error: 'Wallet is not actively bound' };
      }

      const unbindAvailableAt = new Date();
      unbindAvailableAt.setDate(unbindAvailableAt.getDate() + this.UNBIND_COOLDOWN_DAYS);

      await tx
        .update(playerWalletBindings)
        .set({
          unbindRequestedAt: new Date(),
          unbindAvailableAt,
          status: 'pending_unbind',
          updatedAt: new Date(),
        })
        .where(eq(playerWalletBindings.id, binding.id));

      await AuditLogger.log({
        eventType: 'wallet_unbind_requested',
        playerId: request.playerId,
        sessionId,
        ipAddress,
        userAgent,
        severity: 'info',
        metadata: {
          bindingId: binding.id,
          walletAddress: binding.walletAddress,
          unbindAvailableAt: unbindAvailableAt.toISOString(),
          cooldownDays: this.UNBIND_COOLDOWN_DAYS,
        },
      });

      return {
        success: true,
        binding: {
          id: binding.id,
          walletAddress: binding.walletAddress,
          boundAt: binding.boundAt,
          status: 'pending_unbind',
        },
      };
    }).catch((error: any) => {
      console.error('Unbind request error:', error);
      return { success: false, error: 'Failed to request wallet unbinding' };
    });
  }

  static async cancelUnbind(
    playerId: string,
    sessionId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<WalletBindingResult> {
    return db.transaction(async (tx) => {
      const [binding] = await tx
        .select()
        .from(playerWalletBindings)
        .where(eq(playerWalletBindings.playerId, playerId))
        .limit(1)
        .for('update');

      if (!binding) {
        return { success: false, error: 'No wallet binding found' };
      }

      if (binding.status !== 'pending_unbind') {
        return { success: false, error: 'No pending unbind request to cancel' };
      }

      await tx
        .update(playerWalletBindings)
        .set({
          unbindRequestedAt: null,
          unbindAvailableAt: null,
          status: 'active',
          updatedAt: new Date(),
        })
        .where(eq(playerWalletBindings.id, binding.id));

      await AuditLogger.log({
        eventType: 'wallet_unbind_cancelled',
        playerId,
        sessionId,
        ipAddress,
        userAgent,
        severity: 'info',
        metadata: {
          bindingId: binding.id,
          walletAddress: binding.walletAddress,
        },
      });

      return {
        success: true,
        binding: {
          id: binding.id,
          walletAddress: binding.walletAddress,
          boundAt: binding.boundAt,
          status: 'active',
        },
      };
    }).catch((error: any) => {
      console.error('Cancel unbind error:', error);
      return { success: false, error: 'Failed to cancel unbind request' };
    });
  }

  static async verifyWalletForWithdrawal(
    playerId: string,
    withdrawalWallet: string
  ): Promise<{ valid: boolean; error?: string; binding?: any }> {
    try {
      const checksummedWithdrawal = this.validateWalletAddress(withdrawalWallet);
      
      const [binding] = await db
        .select()
        .from(playerWalletBindings)
        .where(eq(playerWalletBindings.playerId, playerId))
        .limit(1);

      if (!binding) {
        return { 
          valid: false, 
          error: 'No wallet bound. You must bind a wallet before making withdrawals.' 
        };
      }

      if (binding.status !== 'active') {
        return { 
          valid: false, 
          error: 'Your wallet binding is not active. Cancel the unbind request or wait for the cooldown to complete.' 
        };
      }

      if (binding.walletAddress.toLowerCase() !== checksummedWithdrawal.toLowerCase()) {
        await AuditLogger.log({
          eventType: 'wallet_mismatch_withdrawal_attempt',
          playerId,
          severity: 'warning',
          metadata: {
            boundWallet: binding.walletAddress,
            attemptedWallet: checksummedWithdrawal,
            bindingId: binding.id,
          },
        });
        return { 
          valid: false, 
          error: 'Withdrawal wallet does not match your bound wallet' 
        };
      }

      return { valid: true, binding };
    } catch (error: any) {
      console.error('Wallet verification error:', error);
      return { valid: false, error: error.message || 'Failed to verify wallet binding' };
    }
  }

  static async updateLastUsed(playerId: string): Promise<void> {
    try {
      await db
        .update(playerWalletBindings)
        .set({ lastUsedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(playerWalletBindings.playerId, playerId),
            eq(playerWalletBindings.status, 'active')
          )
        );
    } catch (error) {
      console.error('Update last used error:', error);
    }
  }
}
