import { ethers } from "ethers";

/**
 * Build vault action payload for deposit
 */
export function buildDepositAction(userAccount, amount) {
  return {
    operation: 0, // VaultOperation.Deposit
    user: userAccount,
    amount: amount,
    targetChainId: 0
  };
}

/**
 * Build vault action payload for withdrawal
 */
export function buildWithdrawAction(userAccount, amount) {
  return {
    operation: 1, // VaultOperation.Withdraw
    user: userAccount,
    amount: amount,
    targetChainId: 0
  };
}

/**
 * Build vault action payload for cross-chain deposit
 */
export function buildCrossChainDepositAction(userAccount, amount, targetChainEID) {
  return {
    operation: 2, // VaultOperation.CrossChainDeposit
    user: userAccount,
    amount: amount,
    targetChainId: targetChainEID
  };
}

/**
 * Build vault action payload for cross-chain withdrawal
 */
export function buildCrossChainWithdrawAction(userAccount, amount, targetChainEID) {
  return {
    operation: 3, // VaultOperation.CrossChainWithdraw
    user: userAccount,
    amount: amount,
    targetChainId: targetChainEID
  };
}

/**
 * Encode vault action as calldata for adapter
 */
export function encodeVaultAction(action) {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  return abiCoder.encode(
    ["uint8", "address", "uint256", "uint32"], // VaultAction struct
    [action.operation, action.user, action.amount, action.targetChainId]
  );
}

/**
 * Build complete CrossChainAction for vault operation
 */
export function buildVaultCrossChainAction(userAccount, vaultAdapterAddress, operation, amount, targetChainEID) {
  // Build vault action
  let vaultAction;
  if (operation === "deposit") {
    vaultAction = buildDepositAction(userAccount, amount);
  } else if (operation === "withdraw") {
    vaultAction = buildWithdrawAction(userAccount, amount);
  } else if (operation === "crossDeposit") {
    vaultAction = buildCrossChainDepositAction(userAccount, amount, targetChainEID);
  } else if (operation === "crossWithdraw") {
    vaultAction = buildCrossChainWithdrawAction(userAccount, amount, targetChainEID);
  } else {
    throw new Error(`Unknown vault operation: ${operation}`);
  }
  
  // Encode as calldata
  const calldata = encodeVaultAction(vaultAction);
  
  // Generate unique action ID
  const actionId = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "bytes", "uint256"],
      [userAccount, vaultAdapterAddress, calldata, BigInt(Math.floor(Date.now() / 1000))]
    )
  );
  
  return {
    userAccount: userAccount,
    targetAdapter: vaultAdapterAddress,
    adapterCalldata: calldata,
    timestamp: Math.floor(Date.now() / 1000),
    actionId: actionId
  };
}

