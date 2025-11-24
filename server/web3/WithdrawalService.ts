import { ethers } from 'ethers';
import { db } from '../db';
import { playerWithdrawals, playerCurrencies } from '../../shared/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { AuditLogger } from './AuditLogger';

export interface WithdrawalRequest {
  playerId: string;
  walletAddress: string;
  currencyType: 'arcaneAsh' | 'crystallineAnimus';
  amount: number;
}

export interface WithdrawalSignature {
  withdrawalId: string;
  signature: string;
  expiresAt: Date;
  nonce: number;
  domain: any;
  types: any;
  message: any;
}

export class WithdrawalService {
  private static SIGNATURE_EXPIRY_MINUTES = 15;
  private static RONIN_CHAIN_ID = 2020;
  private static MAX_DAILY_WITHDRAWALS = 3;
  private static MAX_WITHDRAWAL_AMOUNT_AA = 10000;
  private static MAX_WITHDRAWAL_AMOUNT_CA = 1000;
  
  private static getSignerWallet(): ethers.Wallet {
    const signingKey = process.env.WITHDRAWAL_SIGNER_KEY;
    if (!signingKey) {
      throw new Error('WITHDRAWAL_SIGNER_KEY not configured - required for Web3 withdrawals');
    }
    return new ethers.Wallet(signingKey);
  }

  private static getWithdrawalContractAddress(): string {
    const contractAddress = process.env.WITHDRAWAL_CONTRACT_ADDRESS;
    if (!contractAddress) {
      throw new Error('WITHDRAWAL_CONTRACT_ADDRESS not configured - required for Web3 withdrawals');
    }
    if (!ethers.isAddress(contractAddress)) {
      throw new Error('WITHDRAWAL_CONTRACT_ADDRESS is not a valid Ethereum address');
    }
    return contractAddress.toLowerCase();
  }

  private static async getNextNonceAtomic(playerId: string, tx: any): Promise<number> {
    const lastWithdrawal = await tx
      .select()
      .from(playerWithdrawals)
      .where(eq(playerWithdrawals.playerId, playerId))
      .orderBy(desc(playerWithdrawals.nonce))
      .limit(1)
      .for('update');

    return lastWithdrawal.length > 0 ? lastWithdrawal[0].nonce + 1 : 0;
  }

  static async requestWithdrawal(
    request: WithdrawalRequest,
    sessionId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; error?: string; withdrawalId?: string }> {
    return db.transaction(async (tx) => {
      const playerBalances = await tx
        .select()
        .from(playerCurrencies)
        .where(eq(playerCurrencies.playerId, request.playerId))
        .limit(1)
        .for('update');

      if (playerBalances.length === 0) {
        throw new Error('Player currency record not found');
      }

      const balance = playerBalances[0];
      const currentBalance = request.currencyType === 'arcaneAsh' 
        ? balance.arcaneAsh 
        : balance.crystallineAnimus;

      if (currentBalance < request.amount) {
        await AuditLogger.log({
          eventType: 'withdrawal_request_insufficient_balance',
          playerId: request.playerId,
          sessionId,
          ipAddress,
          userAgent,
          severity: 'warning',
          metadata: {
            requestedAmount: request.amount,
            availableBalance: currentBalance,
            currencyType: request.currencyType,
            walletAddress: request.walletAddress,
          },
        });
        throw new Error('Insufficient balance');
      }

      const maxAmount = request.currencyType === 'arcaneAsh' 
        ? this.MAX_WITHDRAWAL_AMOUNT_AA 
        : this.MAX_WITHDRAWAL_AMOUNT_CA;
      
      if (request.amount > maxAmount) {
        throw new Error(`Maximum withdrawal amount is ${maxAmount} ${request.currencyType}`);
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const todayWithdrawals = await tx
        .select()
        .from(playerWithdrawals)
        .where(
          and(
            eq(playerWithdrawals.playerId, request.playerId),
            gte(playerWithdrawals.createdAt, todayStart)
          )
        );

      if (todayWithdrawals.length >= this.MAX_DAILY_WITHDRAWALS) {
        throw new Error(`Maximum ${this.MAX_DAILY_WITHDRAWALS} withdrawals per day`);
      }

      const nonce = await this.getNextNonceAtomic(request.playerId, tx);

      const currencyField = request.currencyType === 'arcaneAsh' ? 'arcaneAsh' : 'crystallineAnimus';
      
      await tx
        .update(playerCurrencies)
        .set({
          [currencyField]: sql`${playerCurrencies[currencyField]} - ${request.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(playerCurrencies.playerId, request.playerId));

      const [withdrawal] = await tx
        .insert(playerWithdrawals)
        .values({
          playerId: request.playerId,
          walletAddress: request.walletAddress,
          currencyType: request.currencyType,
          amount: request.amount,
          nonce,
          status: 'pending',
        })
        .returning();

      const [newBalance] = await tx
        .select()
        .from(playerCurrencies)
        .where(eq(playerCurrencies.playerId, request.playerId))
        .limit(1);

      const reservedBalance = request.currencyType === 'arcaneAsh' 
        ? newBalance.arcaneAsh 
        : newBalance.crystallineAnimus;

      await AuditLogger.log({
        eventType: 'withdrawal_request',
        playerId: request.playerId,
        sessionId,
        ipAddress,
        userAgent,
        severity: 'info',
        metadata: {
          withdrawalId: withdrawal.id,
          amount: request.amount,
          currencyType: request.currencyType,
          walletAddress: request.walletAddress,
          nonce,
          balanceAfterReservation: reservedBalance,
        },
      });

      return { success: true, withdrawalId: withdrawal.id };
    }).catch((error: any) => {
      console.error('Withdrawal request error:', error);
      return { success: false, error: error.message || 'Internal error processing withdrawal request' };
    });
  }

  static async generateSignature(
    withdrawalId: string,
    verifyingContract?: string
  ): Promise<{ success: boolean; error?: string; signature?: WithdrawalSignature }> {
    return db.transaction(async (tx) => {
      const [withdrawal] = await tx
        .select()
        .from(playerWithdrawals)
        .where(eq(playerWithdrawals.id, withdrawalId))
        .limit(1)
        .for('update');

      if (!withdrawal) {
        throw new Error('Withdrawal not found');
      }

      if (withdrawal.status !== 'pending') {
        throw new Error(`Withdrawal already ${withdrawal.status} - cannot generate signature`);
      }

      const validatedContract = this.getWithdrawalContractAddress();
      
      if (verifyingContract && verifyingContract.toLowerCase() !== validatedContract) {
        await AuditLogger.log({
          eventType: 'withdrawal_contract_spoofing_attempt',
          playerId: withdrawal.playerId,
          severity: 'critical',
          metadata: {
            withdrawalId: withdrawal.id,
            providedContract: verifyingContract,
            validContract: validatedContract,
            suspectedExploit: true,
          },
        });
        throw new Error('Invalid withdrawal contract address - possible exploit attempt');
      }

      const wallet = this.getSignerWallet();
      const expiryTimestamp = Math.floor(Date.now() / 1000) + (this.SIGNATURE_EXPIRY_MINUTES * 60);
      const expiresAt = new Date(expiryTimestamp * 1000);

      const domain = {
        name: 'GemforgeChronicles',
        version: '1',
        chainId: this.RONIN_CHAIN_ID,
        verifyingContract: validatedContract,
      };

      const types = {
        Withdrawal: [
          { name: 'player', type: 'address' },
          { name: 'currency', type: 'string' },
          { name: 'amount', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
        ],
      };

      const message = {
        player: withdrawal.walletAddress,
        currency: withdrawal.currencyType === 'arcaneAsh' ? 'AA' : 'CA',
        amount: BigInt(withdrawal.amount),
        nonce: BigInt(withdrawal.nonce),
        expiry: BigInt(expiryTimestamp),
      };

      const signature = await wallet.signTypedData(domain, types, message);

      const result = await tx
        .update(playerWithdrawals)
        .set({
          signature,
          expiresAt,
          status: 'signed',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(playerWithdrawals.id, withdrawalId),
            eq(playerWithdrawals.status, 'pending')
          )
        );

      if (result.rowCount === 0) {
        throw new Error('Withdrawal status changed during signature generation - possible race with cancellation');
      }

      await AuditLogger.log({
        eventType: 'withdrawal_signed',
        playerId: withdrawal.playerId,
        severity: 'info',
        metadata: {
          withdrawalId: withdrawal.id,
          nonce: withdrawal.nonce,
          expiresAt: expiresAt.toISOString(),
          signerAddress: wallet.address,
        },
      });

      return {
        success: true,
        signature: {
          withdrawalId: withdrawal.id,
          signature,
          expiresAt,
          nonce: withdrawal.nonce,
          domain,
          types,
          message,
        },
      };
    }).catch((error: any) => {
      console.error('Signature generation error:', error);
      return { success: false, error: error.message || 'Failed to generate withdrawal signature' };
    });
  }

  static async markClaimed(
    withdrawalId: string,
    txHash: string
  ): Promise<{ success: boolean; error?: string }> {
    return db.transaction(async (tx) => {
      const [withdrawal] = await tx
        .select()
        .from(playerWithdrawals)
        .where(eq(playerWithdrawals.id, withdrawalId))
        .limit(1)
        .for('update');

      if (!withdrawal) {
        throw new Error('Withdrawal not found');
      }

      if (withdrawal.status === 'claimed') {
        throw new Error('Withdrawal already claimed');
      }

      if (withdrawal.status === 'cancelled') {
        await AuditLogger.log({
          eventType: 'withdrawal_claimed_after_cancel',
          playerId: withdrawal.playerId,
          severity: 'critical',
          metadata: {
            withdrawalId: withdrawal.id,
            amount: withdrawal.amount,
            currencyType: withdrawal.currencyType,
            txHash,
            nonce: withdrawal.nonce,
            suspectedDoubleSpend: true,
          },
        });
        throw new Error('Cannot claim cancelled withdrawal - possible exploit attempt');
      }

      if (withdrawal.status !== 'signed') {
        await AuditLogger.log({
          eventType: 'withdrawal_claimed_invalid_state',
          playerId: withdrawal.playerId,
          severity: 'critical',
          metadata: {
            withdrawalId: withdrawal.id,
            currentStatus: withdrawal.status,
            expectedStatus: 'signed',
            txHash,
          },
        });
        throw new Error(`Withdrawal must be in 'signed' state to be claimed (current: ${withdrawal.status})`);
      }

      await tx
        .update(playerWithdrawals)
        .set({
          status: 'claimed',
          claimedTxHash: txHash,
          claimedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(playerWithdrawals.id, withdrawalId));

      await AuditLogger.log({
        eventType: 'withdrawal_claimed',
        playerId: withdrawal.playerId,
        severity: 'info',
        metadata: {
          withdrawalId: withdrawal.id,
          amount: withdrawal.amount,
          currencyType: withdrawal.currencyType,
          txHash,
          nonce: withdrawal.nonce,
        },
      });

      return { success: true };
    }).catch((error: any) => {
      console.error('Mark claimed error:', error);
      return { success: false, error: error.message || 'Failed to mark withdrawal as claimed' };
    });
  }

  static async cancelWithdrawal(
    withdrawalId: string,
    playerId: string
  ): Promise<{ success: boolean; error?: string }> {
    return db.transaction(async (tx) => {
      const [withdrawal] = await tx
        .select()
        .from(playerWithdrawals)
        .where(
          and(
            eq(playerWithdrawals.id, withdrawalId),
            eq(playerWithdrawals.playerId, playerId)
          )
        )
        .limit(1)
        .for('update');

      if (!withdrawal) {
        throw new Error('Withdrawal not found');
      }

      if (withdrawal.status === 'claimed') {
        throw new Error('Cannot cancel a claimed withdrawal');
      }

      if (withdrawal.status === 'cancelled') {
        throw new Error('Withdrawal already cancelled');
      }

      if (withdrawal.status === 'signed') {
        throw new Error('Cannot cancel a signed withdrawal - signature is valid on-chain. Wait for expiry or claim it.');
      }

      await tx
        .update(playerWithdrawals)
        .set({
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(playerWithdrawals.id, withdrawalId));

      const currencyField = withdrawal.currencyType === 'arcaneAsh' ? 'arcaneAsh' : 'crystallineAnimus';
      
      await tx
        .update(playerCurrencies)
        .set({
          [currencyField]: sql`${playerCurrencies[currencyField]} + ${withdrawal.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(playerCurrencies.playerId, withdrawal.playerId));

      await AuditLogger.log({
        eventType: 'withdrawal_cancelled',
        playerId: withdrawal.playerId,
        severity: 'info',
        metadata: {
          withdrawalId: withdrawal.id,
          amount: withdrawal.amount,
          currencyType: withdrawal.currencyType,
          refunded: true,
        },
      });

      return { success: true };
    }).catch((error: any) => {
      console.error('Cancel withdrawal error:', error);
      return { success: false, error: error.message || 'Failed to cancel withdrawal' };
    });
  }

  static async getPlayerWithdrawals(playerId: string): Promise<any[]> {
    return db
      .select()
      .from(playerWithdrawals)
      .where(eq(playerWithdrawals.playerId, playerId))
      .orderBy(desc(playerWithdrawals.createdAt));
  }
}
