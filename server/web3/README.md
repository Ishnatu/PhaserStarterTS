# Web3 Withdrawal System - EIP-712 Signature Service

## Overview

This service implements secure, server-authoritative withdrawals for Gemforge Chronicles on Ronin blockchain. Players earn Arcane Ash (AA) and Crystalline Animus (CA) through gameplay (server-side), then request withdrawal signatures to claim their tokens on-chain.

## Architecture

### Server-Side Components

1. **WithdrawalService**: Generates EIP-712 signatures for withdrawal permits
2. **AuditLogger**: Security event logging for monitoring and compliance
3. **Database Schema**: PostgreSQL tables with UNIQUE nonce constraints to prevent replay attacks

### Security Model

```
Player → Request Withdrawal → Server validates balance
                            ↓
Server checks:
- Sufficient balance in PostgreSQL
- Daily withdrawal limits (3 pending max)
- Amount caps (AA: 10,000, CA: 1,000)
- Generates monotonic nonce (prevents replay)
                            ↓
Server signs EIP-712 permit with 15-min expiry
                            ↓
Player submits signature to Ronin smart contract
                            ↓
Smart contract verifies signature & transfers tokens
```

## Configuration

### Environment Variables

**Required for Production:**

```bash
# Withdrawal signer private key (server wallet)
# CRITICAL: This must be stored in AWS KMS or HashiCorp Vault for production
# Current implementation uses Replit Secrets (development only)
WITHDRAWAL_SIGNER_KEY=0x...

# Smart contract address (deployed on Ronin mainnet)
WITHDRAWAL_CONTRACT_ADDRESS=0x...
```

### Key Management (Production Requirements)

⚠️ **SECURITY WARNING:** The current implementation uses environment variables for the signing key. **This is NOT production-ready.** Before mainnet deployment:

1. **Migrate to AWS KMS or HashiCorp Vault**
   - Sign with HSM-protected keys
   - Implement key rotation every 90 days
   - Enable audit logging for all signing operations
   - Set up break-glass procedures

2. **Implement Least-Privilege Access**
   - Signing key should only be accessible to withdrawal service
   - Use IAM roles with time-limited sessions
   - Enable MFA for key access

3. **Monitoring & Alerting**
   - Alert on >10 signatures/minute
   - Alert on >100,000 AA or >10,000 CA in 1 hour
   - SIEM integration for audit log analysis

## EIP-712 Signature Format

### Domain

```typescript
{
  name: 'GemforgeChronicles',
  version: '1',
  chainId: 2020,  // Ronin mainnet
  verifyingContract: '0x...'  // Withdrawal contract address
}
```

### Types

```typescript
{
  Withdrawal: [
    { name: 'player', type: 'address' },      // Player's Ronin wallet
    { name: 'currency', type: 'string' },     // 'AA' or 'CA'
    { name: 'amount', type: 'uint256' },      // Withdrawal amount
    { name: 'nonce', type: 'uint256' },       // Monotonic nonce per player
    { name: 'expiry', type: 'uint256' }       // Unix timestamp (15 min from signing)
  ]
}
```

### Example Message

```typescript
{
  player: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  currency: 'AA',
  amount: 1000n,
  nonce: 42n,
  expiry: 1732456789n
}
```

## Smart Contract Interface (Required)

The following Solidity contract interface must be deployed on Ronin to work with this withdrawal service:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IWithdrawalContract {
    // Events
    event WithdrawalClaimed(
        address indexed player,
        string indexed currency,
        uint256 amount,
        uint256 nonce,
        uint256 timestamp
    );
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event ContractPaused(address indexed by);
    event ContractUnpaused(address indexed by);

    // Core functions
    function claimWithdrawal(
        address player,
        string calldata currency,
        uint256 amount,
        uint256 nonce,
        uint256 expiry,
        bytes calldata signature
    ) external;

    // Admin functions
    function updateSigner(address newSigner) external; // Multisig only
    function pause() external; // Emergency circuit breaker
    function unpause() external;
    
    // View functions
    function getPlayerNonce(address player) external view returns (uint256);
    function verifySignature(
        address player,
        string calldata currency,
        uint256 amount,
        uint256 nonce,
        uint256 expiry,
        bytes calldata signature
    ) external view returns (bool);
}
```

### Smart Contract Requirements

1. **Nonce Tracking**: Maintain per-player nonces on-chain to prevent replay attacks
2. **Signature Verification**: Verify EIP-712 signatures match server signer address
3. **Expiry Checks**: Reject signatures older than their expiry timestamp
4. **Amount Caps**: Enforce per-transaction limits (AA: 10,000, CA: 1,000)
5. **Circuit Breaker**: Pausable pattern for emergency shutdown
6. **Multisig Admin**: All admin functions (updateSigner, pause) require 2-of-3 multisig
7. **Event Emission**: Emit detailed events for reconciliation

### Reconciliation

The server must run scheduled jobs to compare:
- PostgreSQL withdrawal records vs on-chain events
- Alert if nonce mismatches detected
- Alert if claimed amounts exceed database balances

## API Usage Examples

### Request Withdrawal

```typescript
const result = await WithdrawalService.requestWithdrawal({
  playerId: 'user123',
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  currencyType: 'arcaneAsh',
  amount: 1000
}, sessionId, ipAddress, userAgent);

if (result.success) {
  console.log('Withdrawal requested:', result.withdrawalId);
}
```

### Generate Signature

```typescript
const sig = await WithdrawalService.generateSignature(
  withdrawalId,
  '0x...' // Withdrawal contract address
);

if (sig.success) {
  // User submits sig.signature.signature to smart contract
  console.log('Signature:', sig.signature);
}
```

### Mark as Claimed (After On-Chain Confirmation)

```typescript
await WithdrawalService.markClaimed(
  withdrawalId,
  '0xabc...' // Ronin transaction hash
);
```

## Rate Limits & Caps

### Per-Player Limits
- **Pending withdrawals**: 3 concurrent max
- **Signature expiry**: 15 minutes from generation
- **Nonce**: Monotonically increasing per player (prevents replay)

### Amount Caps
- **Arcane Ash**: 10,000 per withdrawal
- **Crystalline Animus**: 1,000 per withdrawal

### Future Enhancements
- Dynamic rate limiting based on player level
- VIP tiers with higher limits
- Batch withdrawals for gas optimization

## Security Checklist

Before mainnet deployment:

- [ ] Migrate signing key to AWS KMS or HashiCorp Vault
- [ ] Deploy smart contract with multisig admin (2-of-3 Gnosis Safe)
- [ ] Set up on-chain nonce mirroring
- [ ] Implement reconciliation jobs (PostgreSQL ↔ on-chain events)
- [ ] Enable SIEM integration for audit logs
- [ ] Configure alerting for anomalies (>10 sigs/min, >100k AA/hour)
- [ ] Conduct smart contract audit (CertiK, Quantstamp, or OpenZeppelin)
- [ ] Test circuit breaker emergency pause
- [ ] Document key rotation procedures
- [ ] Set up monitoring dashboards (Grafana + Dune Analytics)

## Audit Logging

All security-sensitive events are logged to `security_audit_log` table:

- `withdrawal_request`: Player requests withdrawal
- `withdrawal_signed`: Signature generated
- `withdrawal_claimed`: Confirmed on-chain
- `withdrawal_cancelled`: Cancelled by player
- `withdrawal_request_insufficient_balance`: Failed due to low balance

## References

- [EIP-712 Specification](https://eips.ethereum.org/EIPS/eip-712)
- [Ronin Chain Documentation](https://docs.roninchain.com/)
- [Gnosis Safe Multisig](https://safe.global/)
- [AWS KMS for Ethereum](https://aws.amazon.com/blockchain/ethereum/)
