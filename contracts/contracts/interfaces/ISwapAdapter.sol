// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISwapAdapter {
    /// @notice Swap any ERC20 token to USDC. Caller must approve tokenIn to this adapter first.
    function swapToUSDC(address tokenIn, uint256 amountIn) external returns (uint256 usdcOut);

    /// @notice Swap native ETH to USDC. Sends ETH via msg.value.
    function swapNativeToUSDC() external payable returns (uint256 usdcOut);
}
